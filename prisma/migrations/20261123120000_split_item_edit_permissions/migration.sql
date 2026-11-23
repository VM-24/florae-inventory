-- "items.edit" (sku, name, description, category, unit in one checkbox) becomes one permission per field;
-- "items.edit_price" (price + opening) is split into price and opening.
-- Roles keep exactly what they could do before.
INSERT INTO "role_permissions" ("roleId", "permission")
SELECT rp."roleId", p
FROM "role_permissions" rp
CROSS JOIN unnest(ARRAY['items.edit_sku', 'items.edit_name', 'items.edit_description', 'items.edit_category', 'items.edit_unit']) AS p
WHERE rp."permission" = 'items.edit'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permission")
SELECT rp."roleId", 'items.edit_opening'
FROM "role_permissions" rp
WHERE rp."permission" = 'items.edit_price'
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" WHERE "permission" = 'items.edit';
