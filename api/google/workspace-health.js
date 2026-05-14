// api/google/workspace-health.js — Workspace health diagnostics endpoint

import { resolveWorkspaceRoot, getWorkspaceHealth, getRawDriveRoot } from "./workspace.js";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  var token = req.query.accessToken || ((req.body || {}).accessToken);
  if (!token) {
    return res.end(JSON.stringify({
      ok: true,
      msg: "Provide ?accessToken= for full health check",
      rawDriveRoot: getRawDriveRoot() ? getRawDriveRoot().substring(0, 20) + "..." : "",
      configured: !!getRawDriveRoot(),
    }));
  }

  var logs = [];

  resolveWorkspaceRoot(token, logs).then(function(resolved) {
    if (!resolved.rootId) {
      return res.end(JSON.stringify({
        ok: true,
        healthy: false,
        workspace: {
          rootFolderName: resolved.rootName || "?",
          rootFolderId: resolved.rootId || "",
          isAutoCorrected: resolved.isAutoCorrected,
          correctionReason: resolved.correctionReason || "Cannot resolve workspace root",
          rawRootName: resolved.rawRootName,
          rawRootId: resolved.rawRootId,
        },
        logs: logs,
      }));
    }

    return getWorkspaceHealth(token, resolved.rootId, logs).then(function(health) {
      return res.end(JSON.stringify({
        ok: true,
        healthy: health.healthy,
        workspace: {
          rootFolderName: resolved.rootName,
          rootFolderId: resolved.rootId,
          rootFolderPath: health.rootFolderPath,
          isAutoCorrected: resolved.isAutoCorrected,
          correctionReason: resolved.correctionReason,
          rawRootName: resolved.rawRootName,
          rawRootId: resolved.rawRootId,
        },
        summary: {
          totalChildren: health.totalChildren,
          requiredFoldersPresent: health.requiredFoldersPresent.length,
          requiredFoldersMissing: health.requiredFoldersMissing.length,
          optionalFoldersPresent: health.optionalFoldersPresent.length,
          folderNames: health.folderNames,
        },
        requiredFolders: {
          present: health.requiredFoldersPresent,
          missing: health.requiredFoldersMissing,
        },
        optionalFolders: {
          present: health.optionalFoldersPresent,
          missing: health.optionalFoldersMissing,
        },
        pptxFiles: health.pptxFiles,
        diagnostics: health.diagnostics,
        logs: logs,
      }));
    });

  }).catch(function(err) {
    res.status(500).end(JSON.stringify({
      ok: false,
      error: err.message || String(err),
      logs: logs,
    }));
  });
}
