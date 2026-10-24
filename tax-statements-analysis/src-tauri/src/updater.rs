// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The updater: one background check against the release endpoint.
//!
//! This is the only part of the application that talks to the network. The work
//! is deliberately kept off the startup path, so an endpoint that cannot be
//! reached, a machine with no connection, or a release that fails signature
//! verification costs startup nothing and is never allowed to hold up the
//! window or the store.
//!
//! The endpoint serves a static `latest.json` naming the installer for this
//! platform together with its signature. The plugin accepts that installer only
//! when the signature was produced by the private key matching the `pubkey` in
//! `tauri.conf.json` — that key, not this code, is what makes an update
//! trustworthy.

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Checks for a newer release and installs it, without involving the user.
///
/// Returns straight away: the check itself runs on the async runtime, so a slow
/// or dead endpoint costs startup nothing.
pub fn check_in_background(app: &AppHandle) {
    let app = app.clone();

    crate::log_info!("updater: checking for a newer release in the background");
    tauri::async_runtime::spawn(async move {
        if let Err(error) = install_if_available(&app).await {
            crate::log_error!("update check failed: {error}");
        }
    });
}

/// Asks the configured endpoint and, when a newer version comes back, downloads
/// it, verifies the signature, and hands it to the installer.
///
/// On Windows the installer terminates this process while applying the update,
/// so the restart on the last line is what brings the new version back up.
async fn install_if_available(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        crate::log_info!("updater: this is the newest version");
        return Ok(());
    };

    crate::log_info!("updater: downloading and installing {}", update.version);
    update
        .download_and_install(|_chunk_length, _content_length| {}, || {})
        .await?;

    crate::log_info!("updater: installed — restarting");
    app.restart()
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
