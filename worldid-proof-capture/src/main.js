import {
  IDKit,
  documentLegacy,
  hashSignal,
  orbLegacy,
  secureDocumentLegacy,
  selfieCheck,
} from "@worldcoin/idkit-core";

const FIXED_ENVIRONMENT = "staging";

const DEFAULTS = {
  signerUrl: import.meta.env.VITE_SIGNER_URL ?? "http://127.0.0.1:8788",
  appId: import.meta.env.VITE_WORLD_ID_APP_ID ?? "",
  action: import.meta.env.VITE_WORLD_ID_ACTION ?? "human-verifier",
  environment: FIXED_ENVIRONMENT,
  preset: "orb",
  signal: "",
  allowLegacy: "false",
  timeoutMs: "180000",
  requestId: `req-v4-${Date.now()}`,
  userAddress:
    import.meta.env.VITE_WORKFLOW_USER_ADDRESS ??
    "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
  targetChain:
    import.meta.env.VITE_WORKFLOW_TARGET_CHAIN ?? "ethereum-testnet-sepolia",
  countryCode: import.meta.env.VITE_WORKFLOW_COUNTRY_CODE ?? "US",
  credentialType: import.meta.env.VITE_WORKFLOW_CREDENTIAL_TYPE ?? "accredited",
};

const elements = {
  signerUrl: document.querySelector("#signerUrl"),
  appId: document.querySelector("#appId"),
  action: document.querySelector("#action"),
  environment: document.querySelector("#environment"),
  preset: document.querySelector("#preset"),
  signal: document.querySelector("#signal"),
  allowLegacy: document.querySelector("#allowLegacy"),
  timeoutMs: document.querySelector("#timeoutMs"),
  requestId: document.querySelector("#requestId"),
  userAddress: document.querySelector("#userAddress"),
  targetChain: document.querySelector("#targetChain"),
  countryCode: document.querySelector("#countryCode"),
  credentialType: document.querySelector("#credentialType"),
  startVerification: document.querySelector("#startVerification"),
  copyPayload: document.querySelector("#copyPayload"),
  status: document.querySelector("#status"),
  connectorUri: document.querySelector("#connectorUri"),
  rawResult: document.querySelector("#rawResult"),
  workflowPayload: document.querySelector("#workflowPayload"),
};

const requiredElementKeys = Object.keys(elements);
for (const key of requiredElementKeys) {
  if (!elements[key]) {
    throw new Error(`Missing required DOM element: ${key}`);
  }
}

const textFields = [
  "signerUrl",
  "appId",
  "action",
  "environment",
  "preset",
  "signal",
  "allowLegacy",
  "timeoutMs",
  "requestId",
  "userAddress",
  "targetChain",
  "countryCode",
  "credentialType",
];

const setStatus = (message, isError = false) => {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
};

const setDefaultValues = () => {
  for (const field of textFields) {
    elements[field].value = DEFAULTS[field];
  }
};

const toPreset = (presetName, signal) => {
  switch (presetName) {
    case "document":
      return documentLegacy(signal ? { signal } : {});
    case "secure_document":
      return secureDocumentLegacy(signal ? { signal } : {});
    case "selfie":
      return selfieCheck(signal ? { signal } : {});
    case "orb":
    default:
      return orbLegacy(signal ? { signal } : {});
  }
};

const parseJsonSafe = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const getFormValues = () => ({
  signerUrl: elements.signerUrl.value.trim().replace(/\/$/, ""),
  appId: elements.appId.value.trim(),
  action: elements.action.value.trim(),
  environment: FIXED_ENVIRONMENT,
  preset: elements.preset.value,
  signal: elements.signal.value.trim(),
  allowLegacy: elements.allowLegacy.value === "true",
  timeoutMs: Number.parseInt(elements.timeoutMs.value, 10),
  requestId: elements.requestId.value.trim() || `req-v4-${Date.now()}`,
  userAddress: elements.userAddress.value.trim(),
  targetChain: elements.targetChain.value,
  countryCode: elements.countryCode.value.trim().toUpperCase(),
  credentialType: elements.credentialType.value,
});

const validateInputs = (values) => {
  if (!values.signerUrl) throw new Error("Signer URL is required.");
  if (!values.appId) throw new Error("App ID is required.");
  if (!values.appId.startsWith("app_staging_")) {
    throw new Error("App ID must be a staging app id (prefix: app_staging_).");
  }
  if (!values.action) throw new Error("Action is required.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(values.userAddress)) {
    throw new Error("User address must be a valid EVM address.");
  }
  if (!Number.isFinite(values.timeoutMs) || values.timeoutMs <= 0) {
    throw new Error("Poll timeout must be a positive number.");
  }
};

const requestRpSignature = async (values) => {
  const signatureResponse = await fetch(`${values.signerUrl}/api/rp-signature`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: values.action,
    }),
  });

  if (!signatureResponse.ok) {
    const body = await signatureResponse.text();
    throw new Error(`Signature endpoint failed (${signatureResponse.status}): ${body}`);
  }

  const signatureBody = await signatureResponse.json();
  if (!signatureBody?.sig || !signatureBody?.nonce) {
    throw new Error("Signature response is missing sig/nonce.");
  }

  return signatureBody;
};

const generateWorkflowPayload = (values, proofResult) => ({
  requestId: values.requestId,
  userAddress: values.userAddress,
  targetChain: values.targetChain,
  countryCode: values.countryCode,
  credentialType: values.credentialType,
  worldProofV4:
    proofResult?.protocol_version === "3.0"
      ? {
          ...proofResult,
          responses: (proofResult.responses ?? []).map((response) => ({
            ...response,
            signal_hash: response.signal_hash ?? hashSignal(values.signal ?? ""),
          })),
        }
      : proofResult,
});

const startVerification = async () => {
  const values = getFormValues();
  validateInputs(values);

  setStatus("Requesting RP signature...");
  elements.connectorUri.value = "";
  elements.rawResult.value = "";
  elements.workflowPayload.value = "";

  const rpSignature = await requestRpSignature(values);
  const request = await IDKit.request({
    app_id: values.appId,
    action: values.action,
    rp_context: {
      rp_id: rpSignature.rp_id,
      nonce: rpSignature.nonce,
      created_at: rpSignature.created_at,
      expires_at: rpSignature.expires_at,
      signature: rpSignature.sig,
    },
    allow_legacy_proofs: values.allowLegacy,
    environment: FIXED_ENVIRONMENT,
  }).preset(toPreset(values.preset, values.signal));

  elements.connectorUri.value = request.connectorURI;
  setStatus("Waiting for World App approval. Scan the connector URI QR/link.");

  const completion = await request.pollUntilCompletion({
    pollInterval: 2000,
    timeout: values.timeoutMs,
  });

  if (!completion.success) {
    throw new Error(`World verification failed: ${completion.error}`);
  }

  elements.rawResult.value = JSON.stringify(completion.result, null, 2);
  const workflowPayload = generateWorkflowPayload(values, completion.result);
  elements.workflowPayload.value = JSON.stringify(workflowPayload, null, 2);

  setStatus("Verification completed. Workflow payload is ready.");
};

setDefaultValues();

elements.startVerification.addEventListener("click", async () => {
  try {
    await startVerification();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
});

elements.copyPayload.addEventListener("click", async () => {
  const payload = elements.workflowPayload.value.trim();
  if (!payload) {
    setStatus("No workflow payload to copy yet.", true);
    return;
  }

  const parsedPayload = parseJsonSafe(payload);
  if (!parsedPayload) {
    setStatus("Workflow payload JSON is invalid.", true);
    return;
  }

  await navigator.clipboard.writeText(JSON.stringify(parsedPayload, null, 2));
  setStatus("Workflow payload copied to clipboard.");
});
