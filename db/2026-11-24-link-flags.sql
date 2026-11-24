-- Claude audits linked products and flags odd ones; Tim accepts or relinks them in the extension.
alter table product_links add column if not exists flag_status text;   -- null | 'flagged' | 'accepted'
alter table product_links add column if not exists flag_reason text;
