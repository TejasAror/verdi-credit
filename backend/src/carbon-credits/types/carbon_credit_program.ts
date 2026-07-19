/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/carbon_credit_program.json`.
 */
export type CarbonCreditProgram = {
  "address": "41jbriQNyaJLuUfJWennbwVqGTQeBDc94Ywj4pGBarnv",
  "metadata": {
    "name": "carbonCreditProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "VerdiCred Stage 4 — Carbon Credit Issuance on Solana (Anchor + SPL Token-2022)"
  },
  "instructions": [
    {
      "name": "createCreditMint",
      "docs": [
        "Creates the SPL Token-2022 credit mint (decimals = 0) and assigns the",
        "mint authority to the program-controlled Oracle Mint Authority PDA.",
        "Only the deployment authority may call, and only once."
      ],
      "discriminator": [
        199,
        159,
        28,
        231,
        242,
        64,
        150,
        194
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true
        },
        {
          "name": "oracleMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creditMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "deploymentAuthority",
          "writable": true,
          "signer": true,
          "relations": [
            "oracleConfig"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initializes the global OracleConfig. Only the deployment authority may call."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "oracleMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "deploymentAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "verifierOracleAuthority"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mintCredit",
      "docs": [
        "Mints carbon credits against a Stage 3 Verification Report.",
        "",
        "Enforcement (the core Stage 4 requirement):",
        "* Only the Verifier Oracle Authority may invoke.",
        "* `report_status` MUST be `Verified`; `PendingVerification` and",
        "`Rejected` reports are rejected on-chain.",
        "* Exactly `floor(verified_tonnes_scaled)` credits are minted — a strict",
        "1:1 ratio with verified tonnes. The caller may NOT choose the amount;",
        "the on-chain amount is derived from the report, preventing over-issuance.",
        "(e.g. verifiedTonnes = 1250.7 -> 1250 credits).",
        "",
        "On first mint for (project_id, vintage) the CreditBatch PDA is created and",
        "the static metadata (methodology, evidence CIDs, report CID, status) is",
        "sealed. Subsequent mints for the same batch append to the tallies."
      ],
      "discriminator": [
        193,
        94,
        86,
        89,
        201,
        124,
        177,
        189
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "oracleMintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creditMint",
          "writable": true
        },
        {
          "name": "verifierOracleAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient",
          "docs": [
            "Recipient of the freshly minted credits."
          ]
        },
        {
          "name": "recipientTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "creditMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creditBatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  95,
                  98,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creditMint"
              },
              {
                "kind": "arg",
                "path": "params.project_id"
              },
              {
                "kind": "arg",
                "path": "params.vintage"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "clock",
          "address": "SysvarC1ock11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "mintParams"
            }
          }
        }
      ]
    },
    {
      "name": "retireCredit",
      "docs": [
        "Retires (burns) `amount` credits permanently. The supply is destroyed so",
        "the credits cannot be transferred or retired again. An immutable",
        "RetirementRecord PDA is written as the audit trail."
      ],
      "discriminator": [
        132,
        213,
        24,
        8,
        165,
        88,
        158,
        34
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "creditMint",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "creditBatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  95,
                  98,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creditMint"
              },
              {
                "kind": "account",
                "path": "credit_batch.project_id",
                "account": "creditBatch"
              },
              {
                "kind": "account",
                "path": "credit_batch.vintage",
                "account": "creditBatch"
              }
            ]
          }
        },
        {
          "name": "retirementRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  116,
                  105,
                  114,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creditMint"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "credit_batch.retirement_count",
                "account": "creditBatch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "clock",
          "address": "SysvarC1ock11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "retireParams"
            }
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Pauses / unpauses the program. Only the deployment authority may call."
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true
        },
        {
          "name": "deploymentAuthority",
          "signer": true,
          "relations": [
            "oracleConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setVerifierOracleAuthority",
      "docs": [
        "Rotates the Verifier Oracle Authority. Only the current oracle authority may call."
      ],
      "discriminator": [
        75,
        186,
        109,
        10,
        45,
        108,
        169,
        150
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true
        },
        {
          "name": "verifierOracleAuthority",
          "signer": true,
          "relations": [
            "oracleConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "transferCredit",
      "docs": [
        "Transfers `amount` credits from `from` to `to`. Owner of `from` signs."
      ],
      "discriminator": [
        51,
        61,
        74,
        6,
        115,
        204,
        141,
        155
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  100,
                  105,
                  99,
                  114,
                  101,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "creditMint",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "to"
        },
        {
          "name": "fromTokenAccount",
          "writable": true
        },
        {
          "name": "toTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "creditBatch",
      "discriminator": [
        176,
        80,
        207,
        188,
        238,
        144,
        128,
        42
      ]
    },
    {
      "name": "oracleConfig",
      "discriminator": [
        133,
        196,
        152,
        50,
        27,
        21,
        145,
        254
      ]
    },
    {
      "name": "retirementRecord",
      "discriminator": [
        92,
        94,
        20,
        172,
        23,
        190,
        157,
        123
      ]
    }
  ],
  "events": [
    {
      "name": "creditMinted",
      "discriminator": [
        133,
        192,
        93,
        101,
        201,
        105,
        243,
        8
      ]
    },
    {
      "name": "creditRetired",
      "discriminator": [
        92,
        105,
        193,
        210,
        104,
        251,
        168,
        57
      ]
    },
    {
      "name": "creditTransferred",
      "discriminator": [
        182,
        61,
        141,
        5,
        106,
        190,
        253,
        0
      ]
    },
    {
      "name": "oracleAuthorityChanged",
      "discriminator": [
        99,
        202,
        165,
        202,
        245,
        74,
        214,
        220
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the Verifier Oracle Authority"
    },
    {
      "code": 6001,
      "name": "alreadyInitialized",
      "msg": "Program already initialized"
    },
    {
      "code": 6002,
      "name": "mintNotCreated",
      "msg": "Credit mint has not been created yet"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "paused",
      "msg": "Program is paused"
    },
    {
      "code": 6005,
      "name": "invalidVintage",
      "msg": "Invalid vintage (must be 1..=9999)"
    },
    {
      "code": 6006,
      "name": "insufficientBalance",
      "msg": "Insufficient token balance for transfer or retirement"
    },
    {
      "code": 6007,
      "name": "retirementOverflow",
      "msg": "Retirement overflow: retired exceeds minted"
    },
    {
      "code": 6008,
      "name": "mintMismatch",
      "msg": "Provided mint does not match the configured credit mint"
    },
    {
      "code": 6009,
      "name": "batchMismatch",
      "msg": "CreditBatch metadata mismatch for this project/vintage"
    },
    {
      "code": 6010,
      "name": "stringTooLong",
      "msg": "String field exceeds the maximum allowed length"
    },
    {
      "code": 6011,
      "name": "notVerified",
      "msg": "Verification report status is not VERIFIED; issuance blocked"
    },
    {
      "code": 6012,
      "name": "tooManyEvidenceCids",
      "msg": "Too many evidence CIDs supplied"
    },
    {
      "code": 6013,
      "name": "batchNotInitialized",
      "msg": "CreditBatch account is not initialized"
    }
  ],
  "types": [
    {
      "name": "creditBatch",
      "docs": [
        "Per (project, vintage) issuance record. Stores the credit metadata required",
        "for auditability and enforces 1:1 accounting via the minted/retired tallies."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "projectId",
            "type": "string"
          },
          {
            "name": "vintage",
            "type": "u16"
          },
          {
            "name": "methodology",
            "type": "string"
          },
          {
            "name": "evidenceCid",
            "type": "string"
          },
          {
            "name": "reportCid",
            "type": "string"
          },
          {
            "name": "evidenceCids",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "reportStatus",
            "type": {
              "defined": {
                "name": "reportStatus"
              }
            }
          },
          {
            "name": "verifiedTonnesScaled",
            "docs": [
              "The (already floored) verified tonnes this batch was issued against.",
              "credits_to_mint == verified_tonnes_scaled, guaranteeing the 1:1 ratio."
            ],
            "type": "u64"
          },
          {
            "name": "totalMinted",
            "type": "u64"
          },
          {
            "name": "totalRetired",
            "type": "u64"
          },
          {
            "name": "retirementCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creditMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "projectId",
            "type": "string"
          },
          {
            "name": "vintage",
            "type": "u16"
          },
          {
            "name": "amount",
            "docs": [
              "Credits minted = floor(verified tonnes) for this report."
            ],
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "reportCid",
            "type": "string"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "reportStatus",
            "type": {
              "defined": {
                "name": "reportStatus"
              }
            }
          },
          {
            "name": "verifiedTonnesScaled",
            "docs": [
              "Verified tonnes (floored) the issuance is backed by."
            ],
            "type": "u64"
          },
          {
            "name": "totalMinted",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "creditRetired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "retirementRecord",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "totalRetired",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "creditTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mintParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "projectId",
            "type": "string"
          },
          {
            "name": "vintage",
            "type": "u16"
          },
          {
            "name": "methodology",
            "type": "string"
          },
          {
            "name": "evidenceCids",
            "docs": [
              "All evidence CIDs associated with the verification report."
            ],
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "reportCid",
            "docs": [
              "IPFS CID of the Stage 3 verification report."
            ],
            "type": "string"
          },
          {
            "name": "reportStatus",
            "docs": [
              "Report verification status. Must be `Verified` (1) or minting is blocked."
            ],
            "type": {
              "defined": {
                "name": "reportStatus"
              }
            }
          },
          {
            "name": "verifiedTonnesScaled",
            "docs": [
              "Verified tonnes (already floored to an integer). credits_to_mint == this."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oracleAuthorityChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldAuthority",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "docs": [
        "Global program configuration. Created once by the deployment authority.",
        "`credit_mint` remains the default (zero) Pubkey until `create_credit_mint` runs."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deploymentAuthority",
            "type": "pubkey"
          },
          {
            "name": "verifierOracleAuthority",
            "type": "pubkey"
          },
          {
            "name": "creditMint",
            "type": "pubkey"
          },
          {
            "name": "creditMintSet",
            "type": "bool"
          },
          {
            "name": "authorityName",
            "type": "string"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "oracleMintAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "reportStatus",
      "docs": [
        "Status of a Stage 3 Verification Report. Only `Verified` reports may be",
        "used to mint carbon credits. `PendingVerification` and `Rejected` reports",
        "are explicitly blocked on-chain."
      ],
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pendingVerification"
          },
          {
            "name": "verified"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "retireParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "reportRef",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "retirementRecord",
      "docs": [
        "Immutable, permanent record of a single retirement event. The underlying",
        "Token-2022 supply is burned, so the credits can never be reused; this PDA is",
        "the queryable, tamper-evident audit trail."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "reportRef",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
