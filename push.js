const webpush = require("web-push");

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
    console.error("VAPID keys are missing.");
    process.exit(1);
}

webpush.setVapidDetails(
    "mailto:smartreminder@example.com",
    publicKey,
    privateKey
);

async function main() {
    try {
        const subscription = JSON.parse(process.argv[2]);
        const payload = process.argv[3] || "{}";

        await webpush.sendNotification(
            subscription,
            payload
        );

        console.log("PUSH_SENT");
    } catch (error) {
        console.error(
            "PUSH_FAILED:",
            error.statusCode || "",
            error.message || error
        );

        process.exit(1);
    }
}

main();