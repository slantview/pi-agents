export const PAPERCLIP_ALLOWED_TOOLS = [
  "paperclipListAgents",
  "paperclipGetAgent",
  "paperclipListIssues",
  "paperclipGetIssue",
  "paperclipGetHeartbeatContext",
  "paperclipListComments",
  "paperclipGetComment",
  "paperclipListIssueApprovals",
  "paperclipListDocuments",
  "paperclipGetDocument",
  "paperclipListDocumentRevisions",
  "paperclipListProjects",
  "paperclipGetProject",
  "paperclipGetIssueWorkspaceRuntime",
  "paperclipWaitForIssueWorkspaceService",
  "paperclipListGoals",
  "paperclipGetGoal",
  "paperclipListApprovals",
  "paperclipGetApproval",
  "paperclipGetApprovalIssues",
  "paperclipListApprovalComments",
  "paperclipControlIssueWorkspaceServices",
  "paperclipCreateApproval",
  "paperclipCreateIssue",
  "paperclipUpdateIssue",
  "paperclipCheckoutIssue",
  "paperclipReleaseIssue",
  "paperclipAddComment",
  "paperclipSuggestTasks",
  "paperclipAskUserQuestions",
  "paperclipRequestConfirmation",
  "paperclipRequestCheckboxConfirmation",
  "paperclipUpsertIssueDocument",
  "paperclipRestoreIssueDocumentRevision",
  "paperclipLinkIssueApproval",
  "paperclipUnlinkIssueApproval",
  "paperclipApprovalDecision",
  "paperclipAddApprovalComment",
];

function collectCompanyIds(value, ids = new Set(), seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return ids;
  seen.add(value);
  if (!Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
      if (normalizedKey === "companyid" && typeof child === "string") ids.add(child);
      else if (normalizedKey === "company" && child && typeof child === "object" && typeof child.id === "string") ids.add(child.id);
      else collectCompanyIds(child, ids, seen);
    }
  } else {
    for (const child of value) collectCompanyIds(child, ids, seen);
  }
  return ids;
}

function assertCompanyEvidence(value, companyId, required) {
  const ids = collectCompanyIds(value);
  for (const id of ids) {
    if (id !== companyId) throw new Error("Paperclip resource is outside the configured company");
  }
  if (required && ids.size === 0) throw new Error("Paperclip resource did not prove membership in the configured company");
}

function addCompanyQuery(requestPath, companyId) {
  const url = new URL(requestPath, "https://paperclip.invalid");
  url.searchParams.set("companyId", companyId);
  return `${url.pathname}${url.search}`;
}

export function bindPaperclipCompany(client, companyId) {
  if (typeof companyId !== "string" || companyId.trim() === "") throw new Error("A trusted Paperclip company is required");
  const trustedCompany = companyId.trim();
  const rawRequest = client.requestJson.bind(client);
  const allowedWorkspaceIds = new Set();

  client.resolveCompanyId = (candidate) => {
    const requested = typeof candidate === "string" ? candidate.trim() : "";
    if (requested && requested !== trustedCompany) throw new Error("Paperclip request is outside the configured company");
    return trustedCompany;
  };

  const verifyReference = async (kind, id) => {
    const encoded = encodeURIComponent(id);
    if (kind === "project" || kind === "agent") {
      const result = await rawRequest("GET", addCompanyQuery(`/${kind}s/${encoded}`, trustedCompany));
      assertCompanyEvidence(result, trustedCompany, false);
      return;
    }
    const result = await rawRequest("GET", `/${kind}s/${encoded}`);
    assertCompanyEvidence(result, trustedCompany, true);
  };

  const verifyBodyReferences = async (value, seen = new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
      if (normalizedKey === "companyid" && typeof child === "string") {
        client.resolveCompanyId(child);
        continue;
      }
      const referenceKinds = {
        issueid: "issue",
        parentid: "issue",
        approvalid: "approval",
        goalid: "goal",
        projectid: "project",
        agentid: "agent",
        assigneeagentid: "agent",
      };
      const kind = referenceKinds[normalizedKey];
      if (kind && typeof child === "string") {
        await verifyReference(kind, child);
        continue;
      }
      if (normalizedKey === "issueids" && Array.isArray(child)) {
        for (const id of child) if (typeof id === "string") await verifyReference("issue", id);
        continue;
      }
      await verifyBodyReferences(child, seen);
    }
  };

  client.requestJson = async (method, requestPath, options) => {
    await verifyBodyReferences(options?.body);
    const parsed = new URL(requestPath, "https://paperclip.invalid");
    const pathname = parsed.pathname;
    const companyMatch = pathname.match(/^\/companies\/([^/]+)(?:\/|$)/u);
    if (companyMatch) {
      if (decodeURIComponent(companyMatch[1]) !== trustedCompany) throw new Error("Paperclip request is outside the configured company");
      const result = await rawRequest(method, `${pathname}${parsed.search}`, options);
      assertCompanyEvidence(result, trustedCompany, false);
      return result;
    }

    const scopedObject = pathname.match(/^\/(issues|goals|approvals)\/([^/]+)(\/.*)?$/u);
    if (scopedObject) {
      const basePath = `/${scopedObject[1]}/${scopedObject[2]}`;
      if (method === "GET" && !scopedObject[3]) {
        const result = await rawRequest(method, `${pathname}${parsed.search}`, options);
        assertCompanyEvidence(result, trustedCompany, true);
        return result;
      }
      const parent = await rawRequest("GET", basePath);
      assertCompanyEvidence(parent, trustedCompany, true);
      const result = await rawRequest(method, `${pathname}${parsed.search}`, options);
      assertCompanyEvidence(result, trustedCompany, false);
      for (const id of findWorkspaceIds(result)) allowedWorkspaceIds.add(id);
      return result;
    }

    if (/^\/(projects|agents)\/[^/]+$/u.test(pathname) && pathname !== "/agents/me") {
      const result = await rawRequest(method, addCompanyQuery(`${pathname}${parsed.search}`, trustedCompany), options);
      assertCompanyEvidence(result, trustedCompany, false);
      return result;
    }

    const workspaceMatch = pathname.match(/^\/execution-workspaces\/([^/]+)\//u);
    if (workspaceMatch && allowedWorkspaceIds.has(decodeURIComponent(workspaceMatch[1]))) {
      return rawRequest(method, `${pathname}${parsed.search}`, options);
    }

    throw new Error("Paperclip wrapper rejected an unsupported or unscoped API path");
  };
  return client;
}

function findWorkspaceIds(value, ids = new Set(), seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return ids;
  seen.add(value);
  if (!Array.isArray(value) && value.workspace && typeof value.workspace === "object" && typeof value.workspace.id === "string") {
    ids.add(value.workspace.id);
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) findWorkspaceIds(child, ids, seen);
  return ids;
}
