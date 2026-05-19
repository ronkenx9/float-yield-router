import { generateEntitySecret, registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load the .env.local file
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function setupEntitySecret() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey || apiKey === 'your_circle_api_key_here') {
    throw new Error("CIRCLE_API_KEY is not set or invalid in .env.local");
  }

  console.log("Using generated Entity Secret...");
  const entitySecret = "2a383dfff8e78d6dbc8580a1181971bb516809bca4bc9927e6e1e7075f517d29";
  console.log(`Generated Secret: ${entitySecret}`);

  console.log("Registering Entity Secret Ciphertext with Circle...");
  try {
    const response = await registerEntitySecretCiphertext({
      apiKey: apiKey,
      entitySecret: entitySecret,
      recoveryFileDownloadPath: "./circle_recovery",
    });

    console.log("Recovery file downloaded successfully.");

    // Update the .env.local file with the new secret
    const envPath = path.resolve(process.cwd(), '.env.local');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(
      /CIRCLE_ENTITY_SECRET=.*/,
      `CIRCLE_ENTITY_SECRET=${entitySecret}`
    );
    fs.writeFileSync(envPath, envContent);

    console.log("✅ Successfully updated CIRCLE_ENTITY_SECRET in .env.local");
  } catch (error) {
    console.error("Failed to register entity secret:", error);
  }
}

setupEntitySecret();
