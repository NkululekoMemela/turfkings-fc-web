const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const CLIENT_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-client.json");
const TOKEN_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-token.json");
const DRIVE_ROOT_FOLDER_NAME = "FANM_BACKUPS_AUTO";

function driveClient() {
  const credentials = JSON.parse(fs.readFileSync(CLIENT_PATH, "utf8"));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const cfg = credentials.installed || credentials.web;
  const client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris[0]);
  client.setCredentials(token);
  return google.drive({ version: "v3", auth: client });
}

async function findOrCreateFolder(drive, name) {
  const found = await drive.files.list({
    q: "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id,name)",
  });

  if (found.data.files && found.data.files[0]) return found.data.files[0];

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id,name,webViewLink",
  });

  return created.data;
}

async function main() {
  const drive = driveClient();
  const folder = await findOrCreateFolder(drive, DRIVE_ROOT_FOLDER_NAME);

  console.log("Using Drive folder:", folder.name);
  console.log("Folder ID:", folder.id);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpFile = path.join("/tmp", "fanm_backup_test_" + timestamp + ".json");

  fs.writeFileSync(tmpFile, JSON.stringify({
    projectId: "five-asides-near-me",
    backupMode: "test",
    createdAt: new Date().toISOString(),
    note: "OAuth drive.file test upload succeeded."
  }, null, 2));

  const upload = await drive.files.create({
    requestBody: {
      name: path.basename(tmpFile),
      parents: [folder.id],
      mimeType: "application/json",
    },
    media: {
      mimeType: "application/json",
      body: fs.createReadStream(tmpFile),
    },
    fields: "id,name,webViewLink",
  });

  console.log("Upload successful.");
  console.log("File:", upload.data.name);
  console.log("Link:", upload.data.webViewLink);
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
