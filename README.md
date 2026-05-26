# 🦎 BotMint - Lacertians Auto Minter (OpenSea Drop)

Bot otomatis untuk mint NFT **Lacertians** menggunakan mekanisme **OpenSea SeaDrop** (mintSigned) di **Ethereum Mainnet**.

## 📋 Koleksi Info

| Info | Detail |
|------|--------|
| Collection | [Lacertians](https://opensea.io/collection/lacertians) |
| Chain | Ethereum Mainnet |
| Contract | `0x35f39c6bc77ae5fec20c29b5212a77509fdbaf03` |
| Mint Price | 0.006 ETH |
| Max Supply | 3,000 |
| Slug | `lacertians` |

## ⚡ Cara Kerja

```
User → OpenSea API (fetch signature) → SeaDrop.mintSigned() → NFT Contract
```

Bot ini:
1. **Monitor** stage mint di OpenSea sampai aktif
2. **Fetch signature** dari OpenSea GraphQL API
3. **Execute `mintSigned()`** di SeaDrop contract
4. Support **multi-wallet** untuk mint paralel

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env
# Edit .env dengan konfigurasi kamu (terutama PRIVATE_KEY)
```

### 3. Jalankan bot

**Mode Monitor** (recommended - auto-detect saat mint buka):
```bash
npm start
```
Bot akan polling OpenSea sampai mint stage aktif, lalu auto-mint.

**Mode Instant** (langsung mint kalau stage sudah buka):
Edit `.env` → `BOT_MODE=instant`, lalu:
```bash
npm start
```

**Monitor saja (tanpa auto-mint):**
```bash
npm run monitor
```

**Test koneksi dulu:**
```bash
npm run test-connection
```

## 📋 Konfigurasi Penting

| Variable | Deskripsi | Default |
|----------|-----------|---------|
| `CONTRACT_ADDRESS` | Alamat NFT contract Lacertians | `0x35f39c...` |
| `COLLECTION_SLUG` | Slug koleksi di OpenSea | `lacertians` |
| `STAGE_INDEX` | Index stage target (WL PASS = 1) | `1` |
| `MINT_PRICE` | Harga mint per NFT (ETH) | `0.006` |
| `MINT_AMOUNT` | Jumlah NFT yang mau di-mint | `1` |
| `PRIVATE_KEY` | Private key wallet (JANGAN SHARE!) | - |
| `BOT_MODE` | `monitor` atau `instant` | `monitor` |
| `CHAIN_ID` | Chain ID (Ethereum = 1) | `1` |
| `MAX_GAS_PRICE_GWEI` | Max gas price (Gwei) | `50` |

## 🔍 Cara Cari Stage Index

Jalankan monitor untuk melihat semua stage:
```bash
npm run monitor
```

Output akan menunjukkan stage yang available:
```
📋 ALL STAGES:
   [0] PUBLIC_SALE | ✅ | 0.006 ETH | max: 5
👉 [1] SIGNED_PRESALE | ✅ | 0.006 ETH | max: 5  ← WL PASS
```

Set `STAGE_INDEX` sesuai stage yang kamu target.

## 🔐 Keamanan

- Private key **HANYA** disimpan lokal di `.env`
- `.env` sudah ada di `.gitignore`
- Signature dari OpenSea per-wallet & per-session (tidak bisa di-reuse)
- Bot tidak menyimpan data sensitif

## 📦 Dependencies

- `ethers` - Blockchain interaction (Ethereum)
- `dotenv` - Environment variables
- `chalk` - Colored terminal output
- `node-notifier` - Desktop notifications

## ⚠️ Catatan

- Bot ini support **SIGNED_PRESALE** (WL) dan **PUBLIC_SALE** stage
- Ethereum Mainnet gas lebih mahal dari L2, pastikan saldo cukup (~0.01-0.05 ETH untuk gas + 0.006 ETH mint price)
- Untuk multi-wallet, set `PRIVATE_KEYS` (comma-separated)
- OpenSea API rate limit berlaku — gunakan `OPENSEA_API_KEY` jika punya
- Pastikan wallet punya min ~0.02 ETH (0.006 mint + gas)

## 🛠️ Troubleshooting

**"Not eligible for stage X"**
- Wallet belum terdaftar di WL untuk stage tersebut
- Coba gunakan stage PUBLIC (biasanya index 0) jika bukan WL holder

**"Signature not available"**
- Stage belum dibuka (gunakan mode monitor)
- Rate limited oleh OpenSea (tunggu sebentar)

**"Transaction reverted"**
- Mint sudah habis (sold out)
- Sudah mint max per wallet
- Stage sudah berakhir
- Gas terlalu rendah - naikkan MAX_GAS_PRICE_GWEI

**"Insufficient funds"**
- Wallet butuh min 0.006 ETH (mint) + ~0.01 ETH (gas)
- Top up wallet sebelum menjalankan bot
