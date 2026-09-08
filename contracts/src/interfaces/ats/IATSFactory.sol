// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IATSFactory
/// @notice Minimal interface to the real Hedera ATS Factory's `deployBond`, with the nested config
///         structs copied VERBATIM (field order == ABI encoding) from
///         hashgraph/asset-tokenization-studio (`contracts/factory/IFactory.sol`,
///         `constants/regulation.sol`, `facets/core/ICore.sol`, `proxy/IResolverProxy.sol`).
///         Enums are represented as their ABI type (`uint8`) so the function selector matches the
///         deployed diamond. Used to issue a real compliant bond through Factory `0.0.9213391`.
interface IATSFactory {
    struct ResolverProxyConfiguration {
        bytes32 key;
        uint256 version;
    }

    struct Rbac {
        bytes32 role;
        address[] members;
    }

    struct ERC20MetadataInfo {
        string name;
        string symbol;
        string isin;
        uint8 decimals;
    }

    struct SecurityData {
        address resolver; // IBusinessLogicResolver
        uint256 maxSupply;
        ResolverProxyConfiguration resolverProxyConfiguration;
        ERC20MetadataInfo erc20MetadataInfo;
        Rbac[] rbacs;
        address[] externalPauses;
        address[] externalControlLists;
        address[] externalKycLists;
        address compliance;
        address identityRegistry;
        bool arePartitionsProtected;
        bool isMultiPartition;
        bool isControllable;
        bool isWhiteList;
        bool clearingActive;
        bool internalKycActivated;
        bool erc20VotesActivated;
    }

    struct BondDetailsData {
        bytes3 currency;
        uint256 nominalValue;
        uint8 nominalValueDecimals;
        uint256 startingDate;
        uint256 maturityDate;
    }

    struct BondData {
        SecurityData security;
        BondDetailsData bondDetails;
        address[] proceedRecipients;
        bytes[] proceedRecipientsData;
    }

    struct AdditionalSecurityData {
        bool countriesControlListType;
        string listOfCountries;
        string info;
    }

    struct FactoryRegulationData {
        uint8 regulationType; // enum RegulationType    { NONE, REG_S, REG_D }
        uint8 regulationSubType; // enum RegulationSubType { NONE, REG_D_506_B, REG_D_506_C }
        AdditionalSecurityData additionalSecurityData;
    }

    event BondDeployed(
        address indexed deployer,
        address bondAddress,
        BondData bondData,
        FactoryRegulationData regulationData
    );

    function deployBond(BondData calldata _bondData, FactoryRegulationData calldata _factoryRegulationData)
        external
        returns (address bondAddress_);
}
