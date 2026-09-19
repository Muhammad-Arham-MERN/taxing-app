// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Application entry point: plugin wiring, startup, and the command surface.
//!
//! Registration order matters. The single-instance guard is added **first** so
//! that a second copy of the application is turned away before anything can
//! reach the store — two writers on one SQLite file is a corruption path this
//! module exists to close (FR-054).

mod commands;
mod platform;
mod settings;
mod state;
mod store;
mod temp;

// Updates belong to installed copies only. A development run must never be
// replaced by a downloaded release, so the module is not compiled at all in a
// debug build — which also keeps its entry point free of dead-code warnings.
#[cfg(all(desktop, not(debug_assertions)))]
mod updater;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(windows)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // A fresh temporary folder per run, with the other runs' folders
            // cleared best-effort. This session's files are never candidates for
            // deletion, so a viewer still holding one open cannot block the new
            // session (FR-069, FR-070, research R10).
            let run_folder = temp::start_run(&handle).unwrap_or_else(|_| std::env::temp_dir());
            temp::clear_other_runs(&handle, &run_folder);

            // Read the remembered location and try to open it. Nothing is created
            // here, and nothing is substituted for a store that cannot be reached
            // (FR-025, FR-056).
            app.manage(AppState::new(state::load(&handle), run_folder));

            // Last, and off the startup path: look for a newer release. Release
            // builds only, for the reason given where the module is declared.
            #[cfg(all(desktop, not(debug_assertions)))]
            updater::check_in_background(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::get_storage_state,
            commands::storage::pick_directory,
            commands::storage::pick_store_file,
            commands::storage::assess_location,
            commands::storage::set_storage_location,
            commands::statements::create_statement,
            commands::statements::list_statements,
            commands::statements::update_statement,
            commands::bills::create_bill,
            commands::bills::list_bills,
            commands::bills::get_bill,
            commands::bills::update_bill,
            commands::bills::delete_bill,
            commands::bills::list_customers,
            commands::bills::update_customer,
            commands::bills::open_bill_invoice,
            commands::bills::save_bill_invoice_copy,
            commands::attachments::open_attachment,
            commands::attachments::save_attachment_copy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
