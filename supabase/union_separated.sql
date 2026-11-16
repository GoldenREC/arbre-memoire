-- Couple séparé sans mariage ni divorce (ex. union libre qui a pris fin avant la naissance).
alter type union_status add value if not exists 'separated';
