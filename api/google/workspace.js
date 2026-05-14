// ═══════════════════════════════════════════════════════════
//  BRINC WORKSPACE RESOLVER
//  Validates DRIVE_ROOT, auto-corrects child→parent,
//  provides workspace health diagnostics.
// ═══════════════════════════════════════════════════════════

const RAW_DRIVE_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// Child operational folders that DRIVE_ROOT should NEVER point to
var CHILD_FOLDER_NAMES = [
  "01 Generated Proposals",
  "02 Source Decks",
  "03 Templates",
  "04 Exports",
  "05 Archive",
];

// Required folders for a healthy workspace
var REQUIRED_FOLDERS = [
  "01 Generated Proposals",
  "02 Source Decks",
  "03 Templates",
];

var OPTIONAL_FOLDERS = [
  "04 Exports",
  "05 Archive",
];

// ── 1. Resolve Workspace Root ─────────────────────────────

/**
 * Resolve the true workspace root folder ID.
 * If DRIVE_ROOT points to a child operational folder, walks up to the parent.
 * Returns { rootId, rootName, rootParentId, isAutoCorrected, correctionReason }.
 */
function resolveWorkspaceRoot(token, logs) {
  logs = logs || [];
  logs.push("WORKSPACE: Resolving root for raw ID: " + RAW_DRIVE_ROOT.substring(0, 20) + "...");

  if (!RAW_DRIVE_ROOT) {
    logs.push("WORKSPACE: DRIVE_ROOT is empty");
    return Promise.resolve({
      rootId: "",
      rootName: "",
      rootParentId: "",
      isAutoCorrected: false,
      correctionReason: "DRIVE_ROOT environment variable is not set",
    });
  }

  return fetchFolderMetadata(token, RAW_DRIVE_ROOT, logs).then(function(meta) {
    if (!meta || meta.error) {
      var errMsg = meta && meta.error ? (meta.error.message || "unknown error") : "no response";
      var errCode = meta && meta.error ? (meta.error.code || "?") : "?";
      logs.push("WORKSPACE: Cannot access DRIVE_ROOT folder — error code=" + errCode + " message=" + errMsg);
      return {
        rootId: RAW_DRIVE_ROOT,
        rootName: "?",
        rootParentId: "",
        isAutoCorrected: false,
        correctionReason: "Cannot fetch metadata for DRIVE_ROOT (code=" + errCode + "): " + errMsg,
        rawRootId: RAW_DRIVE_ROOT,
        diagnostics: ["Drive API error code=" + errCode + ": " + errMsg, "Folder ID in env var: " + RAW_DRIVE_ROOT.substring(0, 20) + "..."],
      };
    }

    logs.push("WORKSPACE: Raw DRIVE_ROOT name='" + meta.name + "' id=" + meta.id.substring(0, 12) + "...");
    logs.push("WORKSPACE: Raw DRIVE_ROOT parentIds=[" + (meta.parents || []).join(", ") + "]");

    // Check if DRIVE_ROOT points to a child operational folder
    var isChild = CHILD_FOLDER_NAMES.indexOf(meta.name) >= 0;
    if (!isChild) {
      logs.push("WORKSPACE: DRIVE_ROOT looks correct (name='" + meta.name + "' is not a child folder)");
      return {
        rootId: meta.id,
        rootName: meta.name,
        rootParentId: (meta.parents || [])[0] || "",
        isAutoCorrected: false,
        correctionReason: null,
      };
    }

    // DRIVE_ROOT points to a child folder — try to walk up to parent
    logs.push("WORKSPACE: WARNING — DRIVE_ROOT points to child folder '" + meta.name + "'");
    logs.push("WORKSPACE: Attempting to walk up to parent...");

    var parentIds = meta.parents || [];
    if (parentIds.length === 0) {
      logs.push("WORKSPACE: No parent found — cannot auto-correct");
      return {
        rootId: meta.id,
        rootName: meta.name,
        rootParentId: "",
        isAutoCorrected: false,
        correctionReason: "DRIVE_ROOT points to '" + meta.name + "' but it has no parent folder",
      };
    }

    // Try the first parent
    var candidateId = parentIds[0];
    return fetchFolderMetadata(token, candidateId, logs).then(function(parentMeta) {
      if (!parentMeta) {
        logs.push("WORKSPACE: Cannot access parent folder");
        return {
          rootId: meta.id,
          rootName: meta.name,
          rootParentId: candidateId,
          isAutoCorrected: false,
          correctionReason: "Cannot fetch parent folder metadata",
        };
      }

      logs.push("WORKSPACE: Parent candidate name='" + parentMeta.name + "' id=" + parentMeta.id.substring(0, 12) + "...");

      // Validate the parent has the expected workspace structure
      return listFolderChildren(token, parentMeta.id, logs).then(function(children) {
        var childNames = children
          .filter(function(c) { return c.mimeType === "application/vnd.google-apps.folder"; })
          .map(function(c) { return c.name; });

        logs.push("WORKSPACE: Parent contains folders: [" + childNames.join(", ") + "]");

        var hasGenerated = childNames.indexOf("01 Generated Proposals") >= 0;
        var hasSource = childNames.indexOf("02 Source Decks") >= 0;
        var hasTemplates = childNames.indexOf("03 Templates") >= 0;

        if (hasGenerated || hasSource || hasTemplates) {
          logs.push("WORKSPACE: AUTO-CORRECTED — using parent '" + parentMeta.name + "' as workspace root");
          return {
            rootId: parentMeta.id,
            rootName: parentMeta.name,
            rootParentId: (parentMeta.parents || [])[0] || "",
            isAutoCorrected: true,
            correctionReason: "DRIVE_ROOT was set to child folder '" + meta.name + "', auto-corrected to parent '" + parentMeta.name + "'",
            rawRootId: meta.id,
            rawRootName: meta.name,
          };
        }

        logs.push("WORKSPACE: Parent does not look like a workspace (missing required folders)");
        return {
          rootId: meta.id,
          rootName: meta.name,
          rootParentId: candidateId,
          isAutoCorrected: false,
          correctionReason: "Parent '" + parentMeta.name + "' does not contain required workspace folders",
        };
      });
    });
  });
}

// ── 2. Workspace Health Check ─────────────────────────────

/**
 * Check the health of the workspace.
 * Returns comprehensive diagnostics.
 */
function getWorkspaceHealth(token, rootId, logs) {
  logs = logs || [];
  logs.push("WORKSPACE: Health check for root=" + rootId.substring(0, 12) + "...");

  if (!rootId) {
    return Promise.resolve({
      healthy: false,
      rootFolderName: "?",
      rootFolderId: "",
      totalChildren: 0,
      requiredFoldersPresent: [],
      requiredFoldersMissing: REQUIRED_FOLDERS.slice(),
      optionalFoldersPresent: [],
      optionalFoldersMissing: OPTIONAL_FOLDERS.slice(),
      pptxFiles: {},
      indexedSlides: 0,
      lastScanTimestamp: null,
      diagnostics: ["DRIVE_ROOT is not configured"],
    });
  }

  return fetchFolderMetadata(token, rootId, logs).then(function(meta) {
    if (!meta || meta.error) {
      var errMsg = meta && meta.error ? (meta.error.message || "?") : "no response";
      var errCode = meta && meta.error ? (meta.error.code || "?") : "?";
      return {
        healthy: false,
        rootFolderName: "?",
        rootFolderId: rootId,
        totalChildren: 0,
        requiredFoldersPresent: [],
        requiredFoldersMissing: REQUIRED_FOLDERS.slice(),
        optionalFoldersPresent: [],
        optionalFoldersMissing: OPTIONAL_FOLDERS.slice(),
        pptxFiles: {},
        diagnostics: [
          "Cannot access workspace root folder (code=" + errCode + "): " + errMsg,
          "Check that GOOGLE_DRIVE_FOLDER_ID env var is set to the correct folder ID",
        ],
      };
    }

    return listFolderChildren(token, rootId, logs).then(function(children) {
      var folders = children.filter(function(c) {
        return c.mimeType === "application/vnd.google-apps.folder";
      });
      var folderNames = folders.map(function(f) { return f.name; });
      var totalChildren = children.length;

      // Check required folders
      var requiredPresent = REQUIRED_FOLDERS.filter(function(n) {
        return folderNames.indexOf(n) >= 0;
      });
      var requiredMissing = REQUIRED_FOLDERS.filter(function(n) {
        return folderNames.indexOf(n) < 0;
      });

      // Check optional folders
      var optionalPresent = OPTIONAL_FOLDERS.filter(function(n) {
        return folderNames.indexOf(n) >= 0;
      });
      var optionalMissing = OPTIONAL_FOLDERS.filter(function(n) {
        return folderNames.indexOf(n) < 0;
      });

      var healthy = requiredPresent.length === REQUIRED_FOLDERS.length;

      // Count PPTX files in each operational folder
      var pptxPromises = folders.filter(function(f) {
        return REQUIRED_FOLDERS.indexOf(f.name) >= 0 || OPTIONAL_FOLDERS.indexOf(f.name) >= 0;
      }).map(function(f) {
        return countPptxFiles(token, f.id, logs).then(function(count) {
          return { folderName: f.name, folderId: f.id, count: count };
        });
      });

      return Promise.all(pptxPromises).then(function(pptxCounts) {
        var pptxMap = {};
        pptxCounts.forEach(function(p) { pptxMap[p.folderName] = p; });

        var diagnostics = [];
        diagnostics.push("Root folder: '" + meta.name + "' (" + totalChildren + " children)");
        diagnostics.push("Required folders: " + requiredPresent.length + "/" + REQUIRED_FOLDERS.length + " present");
        if (requiredMissing.length > 0) {
          diagnostics.push("MISSING required: " + requiredMissing.join(", "));
        }
        if (optionalMissing.length > 0) {
          diagnostics.push("Missing optional: " + optionalMissing.join(", "));
        }

        return {
          healthy: healthy,
          rootFolderName: meta.name,
          rootFolderId: rootId,
          rootFolderPath: meta.name,
          totalChildren: totalChildren,
          folderNames: folderNames,
          requiredFoldersPresent: requiredPresent,
          requiredFoldersMissing: requiredMissing,
          optionalFoldersPresent: optionalPresent,
          optionalFoldersMissing: optionalMissing,
          pptxFiles: pptxMap,
          diagnostics: diagnostics,
        };
      });
    });
  });
}

// ── 3. Helpers ────────────────────────────────────────────

function fetchFolderMetadata(token, folderId, logs) {
  var url = "https://www.googleapis.com/drive/v3/files/" + folderId
    + "?fields=id,name,mimeType,parents,ownedByMe,owners(displayName),createdTime,webViewLink"
    + "&supportsAllDrives=true";

  logs.push("WORKSPACE: Fetching metadata for " + folderId.substring(0, 20) + "...");

  return fetch(url, { headers: { Authorization: "Bearer " + token } })
    .then(function(r) {
      logs.push("WORKSPACE: Metadata HTTP status=" + r.status);
      return r.json().then(function(data) {
        if (data.error) {
          logs.push("WORKSPACE: Metadata error code=" + (data.error.code || "?") + " message=" + (data.error.message || "?"));
          data._httpStatus = r.status;
          return data; // Return the error object so caller can inspect it
        }
        return data;
      });
    })
    .catch(function(err) {
      logs.push("WORKSPACE: Metadata fetch exception: " + (err.message || String(err)));
      return { error: { code: -1, message: err.message || String(err) } };
    });
}

function listFolderChildren(token, folderId, logs) {
  var allItems = [];

  function fetchPage(pageToken) {
    var url = "https://www.googleapis.com/drive/v3/files?q="
      + encodeURIComponent("'" + folderId + "' in parents and trashed=false")
      + "&fields=nextPageToken,files(id,name,mimeType,parents,modifiedTime)"
      + "&pageSize=100"
      + "&supportsAllDrives=true"
      + "&includeItemsFromAllDrives=true";

    if (pageToken) {
      url += "&pageToken=" + pageToken;
    }

    logs.push("WORKSPACE: Listing children of " + folderId.substring(0, 12) + "...");

    return fetch(url, { headers: { Authorization: "Bearer " + token } })
      .then(function(r) {
        logs.push("WORKSPACE: List children HTTP status=" + r.status);
        return r.json().then(function(data) {
          if (data.error) {
            logs.push("WORKSPACE: List error code=" + (data.error.code || "?") + " message=" + (data.error.message || "?"));
            return allItems;
          }
          var items = data.files || [];
          logs.push("WORKSPACE: List returned " + items.length + " items");
          items.forEach(function(f) {
            if (f.mimeType === "application/vnd.google-apps.folder") {
              logs.push("WORKSPACE:   folder: '" + f.name + "'");
            }
          });
          allItems = allItems.concat(items);
          if (data.nextPageToken) {
            return fetchPage(data.nextPageToken);
          }
          return allItems;
        });
      })
      .catch(function(err) {
        logs.push("WORKSPACE: List fetch error: " + (err.message || String(err)));
        return allItems;
      });
  }

  return fetchPage(null);
}

function countPptxFiles(token, folderId, logs) {
  var url = "https://www.googleapis.com/drive/v3/files?q="
    + encodeURIComponent("'" + folderId + "' in parents and trashed=false")
    + "&fields=files(id,name,mimeType,fileExtension,shortcutDetails(targetMimeType))"
    + "&pageSize=100"
    + "&supportsAllDrives=true"
    + "&includeItemsFromAllDrives=true";

  return fetch(url, { headers: { Authorization: "Bearer " + token } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        logs.push("WORKSPACE: File count error code=" + (data.error.code || "?") + ": " + (data.error.message || "?"));
        return 0;
      }
      var count = (data.files || []).filter(function(f) {
        var isPptx = f.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        var isSlides = f.mimeType === "application/vnd.google-apps.presentation";
        var isShortcut = f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails &&
          (f.shortcutDetails.targetMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
           f.shortcutDetails.targetMimeType === "application/vnd.google-apps.presentation");
        var byName = f.name && f.name.toLowerCase().endsWith(".pptx");
        return isPptx || isSlides || isShortcut || byName;
      }).length;
      logs.push("WORKSPACE: Presentation count for " + folderId.substring(0, 12) + "... = " + count);
      return count;
    })
    .catch(function(err) {
      logs.push("WORKSPACE: File count exception: " + (err.message || String(err)));
      return 0;
    });
}

// ── 4. Raw DRIVE_ROOT accessor ────────────────────────────

function getRawDriveRoot() {
  return RAW_DRIVE_ROOT;
}

// ── Exports ───────────────────────────────────────────────

export {
  resolveWorkspaceRoot,
  getWorkspaceHealth,
  getRawDriveRoot,
  CHILD_FOLDER_NAMES,
  REQUIRED_FOLDERS,
  OPTIONAL_FOLDERS,
};
