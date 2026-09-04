-- Create a composite unique constraint on OwnershipTransfer (signature, seq)
-- for indexer idempotency: the same transfer within a transaction must be
-- written exactly once even if the indexer reprocesses the signature.

ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_signature_seq_key" UNIQUE ("signature", "seq");
