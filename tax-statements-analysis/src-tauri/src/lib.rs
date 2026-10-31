// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Application entry point: plugin wiring, startup, and the command surface.
//!
//! Registration order matters. The single-instance guard is added **first** so
//! that a second copy of the application is turned away before anything can
//! reach the store — two writers on one database file is a corruption path this
//! module exists to close (FR-054).

mod cloud;
mod commands;
mod files;
mod logging;
mod platform;
mod settings;
mod state;
mod store;
mod temp;
mod transfer;

// Updates belong to installed copies only. A development run must never be
// replaced by a downloaded release, so the module is not compiled at all in a
// debug build — which also keeps its entry point free of dead-code warnings.
#[cfg(all(desktop, not(debug_assertions)))]
mod updater;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Take over the panic hook first, so a panic anywhere in the backend leaves a
    // trail before the process unwinds (or aborts, in a release build).
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        crate::log_error!("PANIC: {info}");
        previous_hook(info);
    }));

    crate::logging::banner("backend starting");
    crate::log_info!(
        "version {} ({}), pid {}",
        env!("CARGO_PKG_VERSION"),
        if cfg!(debug_assertions) { "debug" } else { "release" },
        std::process::id()
    );

    // rustls cannot choose a `CryptoProvider` automatically when both `ring`
    // (via `tauri-plugin-updater`) and `aws-lc-rs` (via `reqwest` and the Turso
    // sync stack) are compiled in. Choose one explicitly, before any TLS use —
    // the Turso sync engine opens during `setup` below.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

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

    crate::log_info!("registering plugins and command handlers, then opening the store");

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            crate::log_info!("setup: preparing the application");

            // A fresh temporary folder per run, with the other runs' folders
            // cleared best-effort. This session's files are never candidates for
            // deletion, so a viewer still holding one open cannot block the new
            // session (FR-069, FR-070, research R10).
            let run_folder = temp::start_run(&handle).unwrap_or_else(|error| {
                crate::log_warn!(
                    "setup: could not create a run folder ({error}); using the system temp folder"
                );
                std::env::temp_dir()
            });
            crate::log_info!("setup: this run's temporary folder is {}", run_folder.display());
            temp::clear_other_runs(&handle, &run_folder);

            // The local-only byte cache: a second database, opened here and never
            // given a remote URL, so file bytes that must not reach the cloud
            // stay on this machine and keep the application usable offline.
            let cache_path = local_cache_path(&handle);
            crate::log_info!("setup: opening the file cache at {}", cache_path.display());
            let cache = tauri::async_runtime::block_on(crate::store::object_cache::ObjectCache::open(
                &cache_path,
            ))
            .unwrap_or_else(|error| {
                crate::log_error!("setup: the file cache could not be opened: {error}");
                panic!("the file cache at {} could not be opened: {error}", cache_path.display());
            });
            crate::log_info!("setup: the file cache is ready");

            // Read the remembered location and try to open it. Nothing is created
            // here, and nothing is substituted for a store that cannot be reached
            // (FR-025, FR-056). Opening is async on the Turso engine (research R2,
            // R3), so the setup thread blocks on it once.
            let store_state = tauri::async_runtime::block_on(state::load(&handle, &cache));
            crate::log_info!(
                "setup: store ready={} location={:?} problem={:?}",
                store_state.session.is_some(),
                store_state.location.as_ref().map(|location| location.path.as_str()),
                store_state.problem
            );
            app.manage(AppState::new(store_state, run_folder, cache));

            // Automatic sync: one pull shortly after startup, then about hourly
            // (research R9, FR-021, FR-022).
            cloud::schedule::spawn(handle.clone());
            crate::log_info!("setup: automatic sync started");

            // Last, and off the startup path: look for a newer release. Release
            // builds only, for the reason given where the module is declared.
            #[cfg(all(desktop, not(debug_assertions)))]
            updater::check_in_background(&handle);

            crate::log_info!("setup: complete");
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
            commands::statements::delete_statement,
            commands::bills::create_bill,
            commands::bills::list_bills,
            commands::bills::get_bill,
            commands::bills::update_bill,
            commands::bills::delete_bill,
            commands::bills::list_customers,
            commands::bills::update_customer,
            commands::bills::open_bill_invoice,
            commands::bills::save_bill_invoice_copy,
            commands::clients::create_client,
            commands::clients::list_clients,
            commands::clients::update_client,
            commands::clients::delete_client,
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::client_records::list_client_records,
            commands::client_records::create_client_record,
            commands::client_records::update_client_record,
            commands::client_records::delete_client_record,
            commands::client_records::open_client_record_file,
            commands::client_records::save_client_record_file_copy,
            commands::attachments::open_attachment,
            commands::attachments::save_attachment_copy,
            commands::cloud::cloud_status,
            commands::cloud::cloud_push,
            commands::cloud::cloud_pull,
            commands::cloud::cloud_usage,
            commands::cloud::cloud_object_usage,
            commands::cloud::cloud_reconnect,
            commands::onboarding::get_setup_state,
            commands::onboarding::save_secrets,
            commands::onboarding::setup_connect,
            commands::onboarding::clear_secrets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Where the local-only byte cache lives: this machine's application data
/// directory, which never syncs. Falls back to the system temporary folder if the
/// data directory cannot be located, so the application still runs.
fn local_cache_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("tax-statements-cache.sqlite")
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
