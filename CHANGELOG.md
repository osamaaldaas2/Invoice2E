# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes at this time.

## [1.0.0] - 2026-02-11

### Added

- Bulk upload redesign with improved UX and progress tracking.
- Multi-invoice credit fix ensuring correct credit deductions per file.
- Download loading state indicator for batch invoice downloads.

### Fixed

- Extraction prompt improvements for more accurate AI-parsed invoice data.
- Batch progress calculation now reflects actual processing state.
- Double credit deductions when processing multiple invoices in a single batch.
- Duplicate history entries appearing in credit usage logs.
- i18n translation gaps and missing locale strings.
- Mobile responsive layout issues across upload and review pages.
- Routing cleanup removing dead routes and fixing redirect loops.
- Password reset flow failing under certain session states.
- Session renewal to prevent premature logouts during long operations.
- Stuck job recovery for batch uploads that stall mid-processing.

### Changed

- QA hardening round 2: credit history accuracy, general stability improvements, and edge-case handling.
