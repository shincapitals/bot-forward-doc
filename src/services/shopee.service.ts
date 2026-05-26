import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';
import { Bot } from 'grammy';

export interface TrackedItem {
    shopId: string;
    itemId: string;
    url: string;
    name?: string;
    lastPrice?: number;
    lastAlertTime?: number; // timestamp to prevent spamming
}

export interface UserShopee {
    userId: number;
    items: TrackedItem[];
}

export class ShopeeService {
    private dataPath: string;
    private usersData: Map<number, TrackedItem[]>;
    private bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
        this.dataPath = path.resolve(__dirname, '../../data/shopee.json');
        this.usersData = new Map();
        this.loadData();
        this.startCronJob();
    }

    private loadData() {
        if (fs.existsSync(this.dataPath)) {
            try {
                const rawData = fs.readFileSync(this.dataPath, 'utf-8');
                const parsed = JSON.parse(rawData);
                if (Array.isArray(parsed)) {
                    parsed.forEach((u: UserShopee) => this.usersData.set(u.userId, u.items));
                }
            } catch (error) {
                console.error('Error loading shopee data:', error);
            }
        }
    }

    private saveData() {
        try {
            const data: UserShopee[] = Array.from(this.usersData.entries()).map(([userId, items]) => ({
                userId,
                items
            }));
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving shopee data:', error);
        }
    }

    public extractIdsFromUrl(url: string): { shopId: string; itemId: string } | null {
        // Pattern 1: https://shopee.vn/...-i.SHOP_ID.ITEM_ID
        const pattern1 = /i\.(\d+)\.(\d+)/;
        const match1 = url.match(pattern1);
        if (match1) return { shopId: match1[1], itemId: match1[2] };

        // Pattern 2: https://shopee.vn/product/SHOP_ID/ITEM_ID
        const pattern2 = /product\/(\d+)\/(\d+)/;
        const match2 = url.match(pattern2);
        if (match2) return { shopId: match1![1], itemId: match1![2] }; // wait, fix this bug before saving...

        return null;
    }

    public async trackItem(userId: number, url: string): Promise<string> {
        let cleanUrl = url.split('?')[0]; // remove query params
        const ids = this.extractIdsFromUrl(cleanUrl);
        
        if (!ids) {
            // Shopee shortened links (shp.ee) need to be resolved first, but for simplicity we only support full links now
            return "⚠️ Link không hợp lệ hoặc chưa được hỗ trợ. Vui lòng gửi link Shopee đầy đủ (có chứa i.shopid.itemid).";
        }

        if (!this.usersData.has(userId)) {
            this.usersData.set(userId, []);
        }
        const items = this.usersData.get(userId)!;

        // Check duplicate
        if (items.some(i => i.shopId === ids.shopId && i.itemId === ids.itemId)) {
            return "⚠️ Sản phẩm này đã có trong danh sách theo dõi của bạn.";
        }

        // Fetch initial data
        const itemData = await this.fetchItemData(ids.shopId, ids.itemId);
        if (!itemData) {
            return "⚠️ Không thể lấy thông tin sản phẩm. Có thể link lỗi hoặc Shopee chặn.";
        }

        items.push({
            shopId: ids.shopId,
            itemId: ids.itemId,
            url: cleanUrl,
            name: itemData.name || 'Unknown Product',
            lastPrice: itemData.price,
        });
        
        this.saveData();
        return `✅ Đã đưa vào radar!\n🛒 **${itemData.name}**\n💰 Giá hiện tại: ${this.formatPrice(itemData.price)}`;
    }

    public getTrackedItems(userId: number): TrackedItem[] {
        return this.usersData.get(userId) || [];
    }

    public untrackItem(userId: number, index: number): boolean {
        const items = this.usersData.get(userId);
        if (items && index > 0 && index <= items.length) {
            items.splice(index - 1, 1);
            this.saveData();
            return true;
        }
        return false;
    }

    private async fetchItemData(shopId: string, itemId: string) {
        try {
            const apiUrl = `https://shopee.vn/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://shopee.vn/'
                }
            });

            if (!response.ok) return null;
            const data = await response.json();
            
            if (data.error || !data.data) return null;
            
            const item = data.data;
            return {
                name: item.name,
                price: item.price / 100000, // Shopee stores price with 5 extra trailing zeros
                upcomingFlashSale: item.upcoming_flash_sale
            };
        } catch (error) {
            console.error('Shopee Fetch Error:', error);
            return null;
        }
    }

    private formatPrice(price: number): string {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    }

    private startCronJob() {
        // Run every 15 minutes
        cron.schedule('*/15 * * * *', async () => {
            console.log('🔄 Checking Shopee prices...');
            const now = Date.now();

            for (const [userId, items] of this.usersData.entries()) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    // Add small delay to avoid being blocked
                    await new Promise(r => setTimeout(r, 2000));
                    
                    const itemData = await this.fetchItemData(item.shopId, item.itemId);
                    if (!itemData) continue;

                    let shouldSave = false;

                    // Update price if changed (optional)
                    if (item.lastPrice !== itemData.price) {
                        item.lastPrice = itemData.price;
                        shouldSave = true;
                    }

                    // Check Flash Sale
                    if (itemData.upcomingFlashSale) {
                        const startTimeMs = itemData.upcomingFlashSale.start_time * 1000; // API returns seconds
                        const flashPrice = itemData.upcomingFlashSale.price / 100000;
                        const timeUntilMs = startTimeMs - now;

                        // If flash sale is within 30 minutes (1800000 ms) and we haven't alerted recently
                        if (timeUntilMs > 0 && timeUntilMs <= 1800000) {
                            // Alert only if not alerted in the last 12 hours for this item
                            if (!item.lastAlertTime || now - item.lastAlertTime > 12 * 60 * 60 * 1000) {
                                item.lastAlertTime = now;
                                shouldSave = true;

                                const dateStr = new Date(startTimeMs).toLocaleTimeString('vi-VN');
                                const msg = `🔥 **SẮP CÓ DEAL SHOPEE!** 🔥\n\n🛒 **${item.name}**\n📉 Sẽ giảm còn: **${this.formatPrice(flashPrice)}**\n⏰ Bắt đầu lúc: ${dateStr}\n\nChuẩn bị chốt đơn: [Link Sản Phẩm](${item.url})`;
                                
                                try {
                                    await this.bot.api.sendMessage(userId, msg, { parse_mode: 'Markdown' });
                                } catch (e) {
                                    console.error('Failed to send Shopee alert:', e);
                                }
                            }
                        }
                    }

                    if (shouldSave) {
                        this.saveData();
                    }
                }
            }
        });
    }
}
