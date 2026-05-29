import express from 'express';
import { Bot } from 'grammy';
import { config } from './config';
import { PaymentService, LsWebhookPayload } from './services/payment.service';

// -----------------------------------------------------------------------
// Webhook HTTP server for LemonSqueezy payment events
// -----------------------------------------------------------------------

/**
 * Start an Express server to receive LemonSqueezy webhooks.
 *
 * @param paymentService  - PaymentService instance (shared with bot)
 * @param bot             - grammY Bot instance (used to DM the user after upgrade)
 */
export function startWebhookServer(paymentService: PaymentService, bot: Bot): void {
    const app = express();

    // Health check (useful for ngrok / deployment verification)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // LemonSqueezy webhook — must use raw body to verify HMAC signature
    app.post(
        '/webhook/lemonsqueezy',
        express.raw({ type: 'application/json' }),
        async (req, res) => {
            // 1. Verify signature
            const signature = req.headers['x-signature'] as string | undefined;

            if (!signature) {
                console.warn('Webhook: missing x-signature header');
                return res.status(401).json({ error: 'Missing signature' });
            }

            const isValid = paymentService.verifyWebhookSignature(req.body as Buffer, signature);
            if (!isValid) {
                console.warn('Webhook: invalid HMAC signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // 2. Parse payload
            let payload: LsWebhookPayload;
            try {
                payload = JSON.parse((req.body as Buffer).toString('utf8')) as LsWebhookPayload;
            } catch (err) {
                console.error('Webhook: failed to parse JSON body', err);
                return res.status(400).json({ error: 'Invalid JSON' });
            }

            // 3. Acknowledge immediately (LS retries if we don't respond quickly)
            res.status(200).json({ received: true });

            // 4. Process event (async — after response sent)
            try {
                const result = await paymentService.handleWebhookEvent(payload);
                if (result) {
                    const { userId, tier } = result;
                    const tierEmoji = tier === 'pro' ? '⭐' : '💎';
                    const tierName = tier === 'pro' ? 'Pro' : 'Premium';
                    const tierPrice = tier === 'pro' ? '$9.99' : '$24.99';

                    // Notify user via Telegram DM
                    await bot.api.sendMessage(
                        userId,
                        `🎉 Thanh toán thành công!\n\n` +
                        `${tierEmoji} Plan của bạn đã được nâng cấp lên ${tierName} (${tierPrice}/tháng).\n\n` +
                        `✅ Đã mở khoá:\n` +
                        (tier === 'pro'
                            ? `• Unlimited forwards\n• Search & Tag\n• Daily Digest\n• Ask AI về research`
                            : `• Tất cả tính năng Pro\n• Sentiment scoring\n• Export research\n• Unlimited Docs`) +
                        `\n\nGõ /plan để xem chi tiết plan của bạn. Cảm ơn đã ủng hộ! 🚀`
                    );
                }
            } catch (err) {
                console.error('Webhook processing error:', err);
            }
        }
    );

    // Start server
    const port = config.webhookPort;
    app.listen(port, () => {
        console.log(`🔗 Webhook server running on port ${port}`);
        console.log(`   Health: http://localhost:${port}/health`);
        console.log(`   LemonSqueezy endpoint: http://localhost:${port}/webhook/lemonsqueezy`);
    });
}
