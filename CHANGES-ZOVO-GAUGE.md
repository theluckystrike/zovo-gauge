# Changes in the Gauge fork

This fork started from Anarios/return-youtube-dislike commit
`3657de9b2c5a5026d5164372c85adbe58391b02b` (version 4.0.4).

The upstream MV3 build, GPL-3.0 licence, copyright notices, source history, and
proven coalesced SPA initialization helper are retained. The Chrome product was
changed into a distinct DOM-only pre-watch filter:

- removed the external dislike API, vote submission, supporter login, remote
  selector configuration, and dislike rendering from the shipped Chrome build;
- added visible like/view parsing and a thumbnail engagement chip for feed,
  search, home, compact, grid, and reel renderers;
- added a user-set quality floor with dim and licensed collapse treatments;
- added a hover estimate of visible likes per day from a page-rendered age;
- added a `chrome.storage.session` ledger and sortable popup ranking;
- added an MV3 licence worker that accepts only correctly shaped purchase keys,
  unlocks only on a server response with `valid: true`, and retains an activated
  grant for offline use on the device;
- added a unique `zgqGauge` DOM/storage namespace, teal gauge interface, and
  original gauge artwork; and
- reduced the Chrome package to the files required by this product.

The licence wall is a distribution convenience, not a technical restriction.
GPL recipients may study, modify, and rebuild the complete corresponding source,
including with different feature defaults.
