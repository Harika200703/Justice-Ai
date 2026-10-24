// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Stores document fingerprints only; it does not prove truth or admissibility.
contract JusticeEvidence {
    mapping(bytes32 => bool) public registered;
    mapping(bytes32 => address) public registeredBy;
    mapping(bytes32 => uint256) public registeredAt;
    event EvidenceRegistered(bytes32 indexed documentHash, address indexed submitter, uint256 timestamp);
    function registerEvidence(bytes32 documentHash) external {
        require(documentHash != bytes32(0), "Empty hash");
        require(!registered[documentHash], "Already registered");
        registered[documentHash] = true;
        registeredBy[documentHash] = msg.sender;
        registeredAt[documentHash] = block.timestamp;
        emit EvidenceRegistered(documentHash, msg.sender, block.timestamp);
    }
    function verifyEvidence(bytes32 documentHash) external view returns (bool) { return registered[documentHash]; }
}
