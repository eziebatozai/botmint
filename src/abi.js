/**
 * ABI untuk Lobster NFT FCFS Mint Bot
 * Contract: 0x1de237c7063a9ee531e06a6c3fba4e3e704f2a74
 * Type: Thirdweb ERC721Drop (DropERC721)
 * Chain: Ethereum Mainnet
 * 
 * Mint function: claim(address _receiver, uint256 _quantity, address _currency,
 *   uint256 _pricePerToken, AllowlistProof _allowlistProof, bytes _data)
 */

// Thirdweb ERC721Drop - Full ABI untuk mint/claim
const THIRDWEB_DROP_ABI = [
  // === CLAIM (MINT) FUNCTION ===
  "function claim(address _receiver, uint256 _quantity, address _currency, uint256 _pricePerToken, tuple(bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof, bytes _data) external payable",

  // === READ FUNCTIONS ===
  "function totalSupply() external view returns (uint256)",
  "function maxSupply() external view returns (uint256)",
  "function nextTokenIdToMint() external view returns (uint256)",
  "function nextTokenIdToClaim() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function contractURI() external view returns (string)",
  "function owner() external view returns (address)",

  // === CLAIM CONDITIONS ===
  "function getActiveClaimConditionId() external view returns (uint256)",
  "function getClaimConditionById(uint256 _conditionId) external view returns (tuple(uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata))",
  "function claimCondition() external view returns (uint256 currentStartId, uint256 count)",

  // === VERIFY CLAIM ===
  "function verifyClaim(uint256 _conditionId, address _claimer, uint256 _quantity, address _currency, uint256 _pricePerToken, tuple(bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) _allowlistProof) external view returns (bool isOverride)",

  // === SUPPLY INFO ===
  "function getSupplyClaimedByWallet(uint256 _conditionId, address _claimer) external view returns (uint256)",

  // === EVENTS ===
  "event TokensClaimed(uint256 indexed claimConditionIndex, address indexed claimer, address indexed receiver, uint256 startTokenId, uint256 quantityClaimed)",
];

// Simplified read-only ABI for monitoring
const NFT_READ_ABI = [
  "function totalSupply() external view returns (uint256)",
  "function maxSupply() external view returns (uint256)",
  "function nextTokenIdToMint() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function owner() external view returns (address)",
  "function contractURI() external view returns (string)",
  "function getActiveClaimConditionId() external view returns (uint256)",
  "function getClaimConditionById(uint256 _conditionId) external view returns (tuple(uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata))",
  "function claimCondition() external view returns (uint256 currentStartId, uint256 count)",
  "function getSupplyClaimedByWallet(uint256 _conditionId, address _claimer) external view returns (uint256)",
];

// Native token address used by thirdweb for ETH payments
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Zero address (for empty allowlist proof currency)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

module.exports = {
  THIRDWEB_DROP_ABI,
  NFT_READ_ABI,
  NATIVE_TOKEN_ADDRESS,
  ZERO_ADDRESS,
};
