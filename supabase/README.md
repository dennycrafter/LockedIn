# Supabase SQL files

`schema.sql` is the full baseline for a fresh setup: it creates every table and column that exists today. `migrations/NNNN_*.sql` are ordered change files for databases that already ran an older baseline; run them in number order after the baseline (each file is idempotent, so running one twice is safe). Every future table or column change ships a new numbered migration in the same PR as the code that uses it, and that PR summary must say "needs running on real Supabase:" followed by the exact SQL to paste into the Supabase SQL editor.
