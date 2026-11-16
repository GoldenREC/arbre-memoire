-- Biologique non reconnu (ex. père biologique qui n'a jamais reconnu l'enfant).
alter type filiation_type add value if not exists 'biological_unrecognized';
