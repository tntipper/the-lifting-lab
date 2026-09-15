# Navigation, dialogs and stack wizard acceptance

Run with Node 24 and the lockfile's dependencies:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:accessibility
npm audit
```

The browser suite uses Playwright Chromium. On a machine with Google Chrome but no Playwright browser download, run `TEST_BROWSER_CHANNEL=chrome npm run test:accessibility`. It creates a fresh headless profile and a temporary loopback HTTP server; it does not attach to an existing browser session. CI can install the pinned Playwright version's Chromium with `npx playwright install --with-deps chromium`.

The fixture renders the actual React components, native dialogs, wizard page and Tailwind stylesheet under React StrictMode. Only Next routing and authentication are replaced by local adapters. All product data and share responses are synthetic; external browser requests are blocked. The suite performs no provider writes, purchases, social posts, customer emails or real sign-ins.

At widths 320, 390, 768, 1024, 1280 and 1440px, it checks:

- Navigation reflow, keyboard disclosure, Escape and trigger focus restoration.
- Closed drawers absent from the focus order; modal initial focus, repeated opening, Escape, close controls, forward/backward focus containment and scroll-lock cleanup.
- Share requests held pending, then completed with 25 points, zero points, an HTTP failure or a network failure. Busy/result status stays inside the dialog, has live-region semantics and remains navigable without reaching browser chrome.
- Wizard step headings receiving focus on forward, backward and restart navigation; named range/custom budget controls and ordinary multi-keystroke decimal entry.
- Exact integer-pence pack budgeting; finite budgets excluding unknown, zero, malformed, sub-penny and unsafe prices; missing prices preventing a complete subtotal even with no budget limit.
- Hormone-support and ZMA categories excluded while their evidence claims are under review; long names wrapping without horizontal overflow; local stack addition moving focus to its resulting link.

Screenshots and structured results are written to ignored `test-results/accessibility/`. Reduced motion keeps score displays stable in screenshots. The unit tests also cover sparse/missing subtotal rows and integer overflow. Listed prices are estimates for the initial packs; the wizard does not claim a monthly cost or a checkout total. Delivery and checkout adjustments remain additional.

These checks cover isolated browser behavior and viewport reflow. They do not certify screen-reader announcements, native browser zoom, Safari/iOS behavior, a deployed Next build or live account/checkout integration. Review those separately before a production release.
