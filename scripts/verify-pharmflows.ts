import { PHARMFLOWS_SUBMISSION_URL, verifyPharmFlowsConnection } from "../server/pharmflows-client";

// Setup check only. Never submits a prescription or reads patient records.
const result = await verifyPharmFlowsConnection();
console.log(JSON.stringify({
  endpoint: PHARMFLOWS_SUBMISSION_URL,
  ...result,
  patientDataSent: false,
  orderCreated: false,
}));
if (!result.verified) process.exitCode = 1;
