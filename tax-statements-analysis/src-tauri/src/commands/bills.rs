// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Composing, reviewing, correcting and deleting bills, and handing their
//! invoices to the operating system.
//!
//! Bills carry no attachments, so their data travels as ordinary JSON. The one
//! thing that crosses as a file is the **rendered invoice PDF**, which the
//! frontend produces and this layer simply writes out and opens or saves — it is
//! never stored (FR-027).

use crate::commands::error::CommandError;
use crate::state::AppState;
use crate::store::bills::{self, Bill, BillSummary, BillUpdate, NewBill, NewBillItem};
use crate::store::customers::{self, Customer};
use serde::Deserialize;
use std::collections::BTreeMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Where the invoice's suggested file name travels when the body is the PDF.
const INVOICE_META_HEADER: &str = "x-bill-invoice-meta";

/// A wallet number in +92 form (client change, 2026-09-19): `+92` then 9–10 digits,
/// spaces and dashes ignored.
fn is_plus92(value: &str) -> bool {
    let compact: String = value
        .chars()
        .filter(|character| *character != ' ' && *character != '-')
        .collect();
    let Some(rest) = compact.strip_prefix("+92") else {
        return false;
    };
    (9..=10).contains(&rest.len()) && rest.chars().all(|character| character.is_ascii_digit())
}

/// `YYYY-MM-DD`, checked by shape (the store only ever compares dates as text).
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The same validity rules the bill form enforces, applied again at the
/// boundary, so an incomplete bill is never written even if the form's guard is
/// bypassed (FR-020, FR-021).
fn bill_problems(
    date: &str,
    customer_name: &str,
    items: &[NewBillItem],
    jazzcash_numbers: &[String],
    easypaisa_numbers: &[String],
) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();

    if !is_iso_date(date) {
        fields.insert("date".to_string(), "Choose a valid date.".to_string());
    }
    if customer_name.trim().is_empty() {
        fields.insert(
            "customerName".to_string(),
            "Enter the customer's name.".to_string(),
        );
    }
    if items.is_empty() {
        fields.insert(
            "items".to_string(),
            "Add at least one item to the bill.".to_string(),
        );
    }
    for (index, item) in items.iter().enumerate() {
        if item.details.trim().is_empty() {
            fields.insert(
                format!("items.{index}.details"),
                "Enter the details for this item.".to_string(),
            );
        }
        if !item.amount.is_finite() || item.amount <= 0.0 {
            fields.insert(
                format!("items.{index}.amount"),
                "Enter an amount greater than zero.".to_string(),
            );
        }
    }

    // Wallet numbers are optional, but any that are given must be in +92 form.
    for (key, example, numbers) in [
        ("jazzcashNumbers", "+923225739614", jazzcash_numbers),
        ("easypaisaNumbers", "+923125739614", easypaisa_numbers),
    ] {
        for (index, number) in numbers.iter().enumerate() {
            if !number.trim().is_empty() && !is_plus92(number) {
                fields.insert(
                    format!("{key}.{index}"),
                    format!("Enter the number in +92 format, e.g. {example}."),
                );
            }
        }
    }

    fields
}

/// Record a bill and return it with its assigned invoice number and item
/// numbers (FR-022, FR-019).
#[tauri::command]
pub fn create_bill(state: State<'_, AppState>, input: NewBill) -> Result<Bill, CommandError> {
    let fields = bill_problems(
        &input.date,
        &input.customer.name,
        &input.items,
        &input.jazzcash_numbers,
        &input.easypaisa_numbers,
    );
    if !fields.is_empty() {
        return Err(CommandError::validation_for("bill", fields));
    }

    state.with_connection(|conn| bills::create(conn, &input))
}

/// The View Bills list, filtered by any combination of an inclusive date range
/// and a customer (FR-038–FR-041, FR-064).
#[tauri::command]
pub fn list_bills(
    state: State<'_, AppState>,
    from: Option<String>,
    to: Option<String>,
    customer: Option<String>,
) -> Result<Vec<BillSummary>, CommandError> {
    state.with_connection(|conn| {
        bills::list(
            conn,
            from.as_deref(),
            to.as_deref(),
            customer.as_deref(),
        )
    })
}

/// One bill with its customer and line items (FR-044).
#[tauri::command]
pub fn get_bill(state: State<'_, AppState>, id: String) -> Result<Bill, CommandError> {
    state.with_connection(|conn| bills::get(conn, &id))
}

/// Correct a bill in place, keeping its identity and invoice number (FR-048).
#[tauri::command]
pub fn update_bill(state: State<'_, AppState>, update: BillUpdate) -> Result<Bill, CommandError> {
    let fields = bill_problems(
        &update.date,
        &update.customer.name,
        &update.items,
        &update.jazzcash_numbers,
        &update.easypaisa_numbers,
    );
    if !fields.is_empty() {
        return Err(CommandError::validation_for("bill", fields));
    }

    state.with_connection(|conn| bills::update(conn, &update))
}

/// Delete a bill and its line items (FR-053, FR-054). The practitioner's
/// confirmation is a UI responsibility; this removes it once invoked.
#[tauri::command]
pub fn delete_bill(state: State<'_, AppState>, id: String) -> Result<(), CommandError> {
    state.with_connection(|conn| bills::delete(conn, &id))
}

/// Every remembered customer, for the View Bills Customer filter (FR-065).
#[tauri::command]
pub fn list_customers(state: State<'_, AppState>) -> Result<Vec<Customer>, CommandError> {
    state.with_connection(|conn| customers::list(conn))
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Save a customer's own details — address, contact person, contact number,
/// email, NTN and password — from the customer popup (client change, 2026-09-19).
#[tauri::command]
pub fn update_customer(
    state: State<'_, AppState>,
    customer: Customer,
) -> Result<Customer, CommandError> {
    if customer.name.trim().is_empty() {
        let mut fields = BTreeMap::new();
        fields.insert("name".to_string(), "Enter the customer's name.".to_string());
        return Err(CommandError::validation_for("customer", fields));
    }

    state.with_connection(|conn| {
        customers::upsert_within(conn, &customer)?;
        customers::get(conn, &customer.name)
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InvoiceMeta {
    file_name: String,
}

fn invoice_meta(request: &Request<'_>) -> Result<InvoiceMeta, CommandError> {
    let raw = request
        .headers()
        .get(INVOICE_META_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| CommandError::io("The invoice's file name did not arrive with it."))?;

    serde_json::from_str(raw)
        .map_err(|error| CommandError::io(format!("The invoice could not be identified: {error}")))
}

fn body_bytes(request: &Request<'_>) -> Vec<u8> {
    match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => Vec::new(),
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Write the rendered invoice to this run's temporary folder and hand it to the
/// operating system, so it opens in the default PDF application (FR-034).
#[tauri::command]
pub async fn open_bill_invoice(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<(), CommandError> {
    let meta = invoice_meta(&request)?;
    let bytes = body_bytes(&request);
    if bytes.is_empty() {
        return Err(CommandError::io("The invoice's contents did not arrive."));
    }

    let path = crate::temp::write_out(&state.run_folder, &meta.file_name, &bytes)
        .map_err(|message| CommandError::new(crate::commands::error::ErrorKind::AttachmentWriteFailed, message))?;

    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| {
            CommandError::new(
                crate::commands::error::ErrorKind::AttachmentOpenFailed,
                format!(
                    "The invoice could not be opened in a PDF application ({error}). You can \
                     still download a copy of it."
                ),
            )
        })
}

/// Save the rendered invoice wherever the practitioner chooses, offering the
/// invoice number as the file name (FR-035).
#[tauri::command]
pub async fn save_bill_invoice_copy(
    app: AppHandle,
    request: Request<'_>,
) -> Result<Option<String>, CommandError> {
    let meta = invoice_meta(&request)?;
    let bytes = body_bytes(&request);
    if bytes.is_empty() {
        return Err(CommandError::io("The invoice's contents did not arrive."));
    }

    let chosen = app
        .dialog()
        .file()
        .set_file_name(&meta.file_name)
        .blocking_save_file();

    let Some(selected) = chosen else {
        return Ok(None);
    };

    let destination = selected
        .into_path()
        .map_err(|error| CommandError::io(format!("That location cannot be used: {error}")))?;

    std::fs::write(&destination, &bytes).map_err(|error| {
        CommandError::new(
            crate::commands::error::ErrorKind::AttachmentWriteFailed,
            format!("The invoice could not be written: {error}"),
        )
    })?;

    Ok(Some(destination.to_string_lossy().to_string()))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
