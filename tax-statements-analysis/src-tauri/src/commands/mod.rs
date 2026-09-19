// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The IPC surface: a thin translation layer from commands to `store`, kept thin
//! on purpose so that the part of the system with no automated tests is as small
//! as possible (plan.md → Constitution Check).

pub mod attachments;
pub mod bills;
pub mod error;
pub mod statements;
pub mod storage;

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
