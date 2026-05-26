# 🦎 BotMint - Lacertians Public Mint Bot (Ethereum)

Bot otomatis untuk **PUBLIC MINT** NFT **Lacertians** via **SeaDrop.mintPublic()** di **Ethereum Mainnet**.

## 📋 Koleksi Info

| Info | Detail |
|------|--------|
| Collection | [Lacertians](https://opensea.io/collection/lacertians) |
| Chain | Ethereum Mainnet (chainId: 1) |
| Contract | `0x35f39c6bc77ae5fec20c29b5212a77509fdbaf03` |
| Mint Price | 0.006 ETH |
| Max Supply | 3,000 |

## ⚡ Cara Kerja

```
User → SeaDrop.mintPublic(nftContract, feeRecipient, 0x0, qty) → NFT minted!
```

**Public mint** = siapa saja bisa mint tanpa perlu WL atau signature.

Bot ini:
1. **Monitor** status public drop on-chain (startTime/endTime)
2. Saat public mint aktif → langsung panggil `SeaDrop.mintPublic()`
3. Support **multi-wallet** untuk mint paralel

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env
# Edit .env → ISI PRIVATE_KEY kamu!
```

### 3. Jalankan bot

**Mode Monitor** (recommended - auto detect saat mint buka):
```bash
npm start
```

**Mode Instant** (langsung mint, pastikan public mint sudah aktif):
```bash
# Edit .env → BOT_MODE=instant
npm start
```

**Monitor saja (tanpa auto-mint):**
```bash
npm run monitor
```

**Test koneksi:**
```bash
npm run test-connection
```

## 📋 Konfigurasi

| Variable | Deskripsi | Default |
|----------|-----------|---------|
| `CONTRACT_ADDRESS` | Lacertians contract | `0x35f39c...` |
| `MINT_PRICE` | Harga mint (ETH) | `0.006` |
| `MINT_AMOUNT` | Jumlah per mint | `1` |
| `PRIVATE_KEY` | Private key wallet | - |
| `BOT_MODE` | `monitor` atau `instant` | `monitor` |
| `MAX_GAS_PRICE_GWEI` | Max gas | `50` |
| `PRIORITY_FEE_GWEI` | Priority fee | `2` |

## 🔐 Keamanan

- Private key **HANYA** disimpan lokal di `.env`
- `.env` sudah ada di `.gitignore`
- Bot tidak menyimpan data sensitif
- Public mint = on-chain, tidak perlu API signature

## 💰 Biaya

- Mint price: **0.006 ETH** per NFT
- Gas fee: ~0.005-0.02 ETH (tergantung network)
- **Total minimal: ~0.03 ETH per wallet**

## 🛠️ Troubleshooting

**"Public mint belum dikonfigurasi"**
- Contract belum set startTime untuk public drop
- Gunakan mode `monitor` untuk tunggu sampai aktif

**"Transaction reverted"**
- Mint sudah sold out
- Sudah mint max per wallet
- Public mint belum/sudah berakhir
- Gas terlalu rendah → naikkan `MAX_GAS_PRICE_GWEI`

**"Insufficient funds"**
- Butuh min 0.006 ETH (mint) + ~0.01 ETH (gas)
- Top up wallet sebelum mint

**"Gas estimate gagal"**
- Contract mungkin belum siap / sold out
- Bot akan pakai fallback gasLimit 200000
