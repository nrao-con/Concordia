# Website prescription requests to PharmFlows

This is a direct server-to-server integration, not a public browser or mobile
connection. OTC, grocery, and shop orders continue to use the staff app.

## Pharmacy setup

In **PharmFlows → Admin → Settings → Website & mobile prescription orders**,
enter this pharmacy's website reference and generate its own connection key.
The exact pharmacy code must come from that pharmacy's settings. Do not
substitute the website's legacy `PHARMFLOWS` order-status query parameter.

Store these two values using this project's secure Secrets form:

- `PHARMFLOWS_PHARMACY_CODE`: the exact code from PharmFlows settings.
- `PHARMFLOWS_API_KEY`: that pharmacy's private connection key.

Never add either value to browser code, mobile bundles, chat, source files,
screenshots, or logs. The key must be unique to this pharmacy.

The submission URL is fixed to:
`https://pharmflows.com/api/external/prescription-requests`.
The old `PHARMFLOWS_ROUTE` setting is no longer used.

## Safe connection check

After saving the secrets and restarting the application, run:

```sh
npm run pharmflows:check
```

This sends only the configured pharmacy code, `_test: true`, and `dryRun: true`,
with the key in the `x-api-key` header. It never reads patient records or sends
patient information. It requires JSON with all of:

- `ok: true`
- `test: true`
- `dryRun: true`
- `pharmacyCode` exactly matching the configured pharmacy.

The command prints only the endpoint, verified/failure status, and whether
patient data was sent. It does not print the code, private key, or raw response.

A missing configuration, authentication rejection, HTML page, redirect,
timeout, or mismatched acknowledgement fails closed. If the published PharmFlows
app still serves HTML at this API address, its connection feature must be
published and checked first.

## Prescription handoff

The existing authenticated `/api/mixed-request` flow verifies patient ownership
of prescription records, splits prescription and shop payloads, and calls this
adapter for the prescription portion. The adapter repeats the safe connection
check **before each submission**, using the same configuration snapshot for the
check and prescription. Failed checks send no patient information.

Only server-built prescription fields are forwarded. A browser cannot select
another pharmacy or inject extra fields. The server sets the pharmacy code and
private key. Shop items never enter this payload.

The live API must acknowledge success explicitly (`ok: true`, `success: true`,
or the previously supported nonempty top-level request `id`); arbitrary JSON
or an echoed dry-run acknowledgement is not treated as a submission.
An accepted handoff does not mean a prescription has been filled or delivered.
Dry-run success verifies credentials and pharmacy scoping, not real-order
processing. No real prescription is submitted by the setup command.

Do not automatically retry uncertain real submissions until PharmFlows
documents receiver-enforced request idempotency. The existing website request
key prevents repeated clicks from blindly resending the same request.

This adapter does not reroute separate PrimeRx refill mutations, chat
callback/intake requests, or other prescription workflows that do not use the
mixed-request endpoint.
