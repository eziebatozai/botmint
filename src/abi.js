/**
 * ABI untuk Lobster NFT FCFS Mint Bot
 * 
 * Mendukung berbagai jenis contract mint function:
 * - Standard mint(uint256 quantity)
 * - publicMint(uint256 quantity)
 * - mint(address to, uint256 quantity)
 * - claim(uint256 quantity)
 * - purchase(uint256 quantity)
 * - SeaDrop mintPublic / mintSigned
 * - Custom function signature
 */

// Generic ERC721/ERC721A Read ABI
const NFT_READ_ABI = [
  "function totalSupply() external view returns (uint256)",
  "function maxSupply() external view returns (uint256)",
  "function MAX_SUPPLY() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  
  // Mint status checks (berbagai naming convention)
  "function mintActive() external view returns (bool)",
  "function isMintActive() external view returns (bool)",
  "function saleActive() external view returns (bool)",
  "function publicSaleActive() external view returns (bool)",
  "function isPublicSaleActive() external view returns (bool)",
  "function saleIsActive() external view returns (bool)",
  "function paused() external view returns (bool)",
  "function mintEnabled() external view returns (bool)",
  "function publicMintOpen() external view returns (bool)",
  
  // Price checks
  "function mintPrice() external view returns (uint256)",
  "function price() external view returns (uint256)",
  "function PRICE() external view returns (uint256)",
  "function cost() external view returns (uint256)",
  "function getPrice() external view returns (uint256)",
  "function publicPrice() external view returns (uint256)",
  
  // Supply/limit checks
  "function maxMintAmount() external view returns (uint256)",
  "function maxPerWallet() external view returns (uint256)",
  "function maxPerTransaction() external view returns (uint256)",
  "function MAX_PER_TX() external view returns (uint256)",
  "function numberMinted(address owner) external view returns (uint256)",
  
  // Owner
  "function owner() external view returns (address)",
];

// Common Mint Function ABIs
const MINT_FUNCTIONS_ABI = [
  // Standard mint(quantity)
  "function mint(uint256 quantity) external payable",
  // mint(to, quantity)
  "function mint(address to, uint256 quantity) external payable",
  // publicMint
  "function publicMint(uint256 quantity) external payable",
  // mintPublic
  "function mintPublic(uint256 quantity) external payable",
  // claim
  "function claim(uint256 quantity) external payable",
  // purchase
  "function purchase(uint256 quantity) external payable",
  // safeMint
  "function safeMint(uint256 quantity) external payable",
  // mintNFT
  "function mintNFT(uint256 quantity) external payable",
  // buy
  "function buy(uint256 quantity) external payable",
];

// SeaDrop ABI (OpenSea Drops)
const SEADROP_ABI = [
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) external payable",
  "function mintSigned(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity, tuple(uint80 mintPrice, uint16 maxTotalMintableByWallet, uint48 startTime, uint48 endTime, uint16 dropStageIndex, uint32 maxTokenSupplyForStage, uint16 feeBps, bool restrictFeeRecipients) mintParams, uint256 salt, bytes signature) external payable",
  "function getPublicDrop(address nftContract) external view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))",
  "function getAllowedFeeRecipients(address nftContract) external view returns (address[])",
  "function getMintStats(address nftContract, address minter) external view returns (uint256 minterNumMinted, uint256 currentTotalSupply, uint256 maxSupply)",
];

// SeaDrop contract addresses
const SEADROP_ADDRESSES = {
  1: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',       // Ethereum Mainnet
  8453: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',     // Base
  11155111: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5', // Sepolia
  137: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',      // Polygon
  42161: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',    // Arbitrum
};

// OpenSea fee recipient
const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';

module.exports = {
  NFT_READ_ABI,
  MINT_FUNCTIONS_ABI,
  SEADROP_ABI,
  SEADROP_ADDRESSES,
  OPENSEA_FEE_RECIPIENT,
};
