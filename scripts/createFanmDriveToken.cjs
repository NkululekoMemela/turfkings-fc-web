const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");

const CLIENT_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-client.json");
const TOKEN_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-token.json");

const credentials = JSON.parse(fs.readFileSync(CLIENT_PATH, "utf8"));
const clientConfig = credentials.installed || credentials.web;

const oauth2Client = new google.auth.OAuth2(
  clientConfig.client_id,
  clientConfig.client_secret,
  clientConfig.redirect_uris[0]
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive.file"],
  prompt: "consent",
});

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log("\nAfter approving access, paste the code here.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Code: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    fs.chmodSync(TOKEN_PATH, 0o600);
    console.log("\nToken saved to:");
    console.log(TOKEN_PATH);
  } catch (err) {
    console.error("Failed to create token:", err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
});
