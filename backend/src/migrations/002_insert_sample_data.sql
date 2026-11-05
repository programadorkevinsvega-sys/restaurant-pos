-- Insertar categorías de ejemplo
INSERT INTO categories (id, name, icon, item_count) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Desayunos', 'Coffee', 19),
  ('550e8400-e29b-41d4-a716-446655440002', 'Sopas', 'Soup', 8),
  ('550e8400-e29b-41d4-a716-446655440003', 'Pastas', 'UtensilsCrossed', 14),
  ('550e8400-e29b-41d4-a716-446655440004', 'Plato Principal', 'ChefHat', 27),
  ('550e8400-e29b-41d4-a716-446655440005', 'Hamburguesas', 'Sandwich', 13),
  ('550e8400-e29b-41d4-a716-446655440006', 'Bebidas', 'Coffee', 15)
ON CONFLICT (id) DO NOTHING;

-- Insertar productos de ejemplo
INSERT INTO products (id, name, description, price, image_url, discount_percentage, type, category_id) VALUES
  -- Desayunos
  ('650e8400-e29b-41d4-a716-446655440001', 'Desayuno Americano Completo', 'Huevos revueltos, tocino, salchichas, tostadas y café', 12.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Non Veg', '550e8400-e29b-41d4-a716-446655440001'),
  ('650e8400-e29b-41d4-a716-446655440002', 'Pancakes con Frutas', 'Stack de pancakes con frutas frescas y miel', 9.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 15, 'Veg', '550e8400-e29b-41d4-a716-446655440001'),
  ('650e8400-e29b-41d4-a716-446655440003', 'Avocado Toast', 'Pan tostado con aguacate, tomate cherry y huevo pochado', 11.50, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Veg', '550e8400-e29b-41d4-a716-446655440001'),

  -- Sopas
  ('650e8400-e29b-41d4-a716-446655440004', 'Sopa de Tomate Clásica', 'Sopa cremosa de tomate con albahaca fresca', 7.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Veg', '550e8400-e29b-41d4-a716-446655440002'),
  ('650e8400-e29b-41d4-a716-446655440005', 'Sopa de Pollo con Fideos', 'Sopa tradicional de pollo con verduras y fideos', 8.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 10, 'Non Veg', '550e8400-e29b-41d4-a716-446655440002'),

  -- Pastas
  ('650e8400-e29b-41d4-a716-446655440006', 'Spaghetti Carbonara', 'Pasta con salsa carbonara, tocino y queso parmesano', 14.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Non Veg', '550e8400-e29b-41d4-a716-446655440003'),
  ('650e8400-e29b-41d4-a716-446655440007', 'Penne Arrabbiata', 'Pasta penne con salsa de tomate picante y ajo', 12.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Veg', '550e8400-e29b-41d4-a716-446655440003'),

  -- Platos Principales
  ('650e8400-e29b-41d4-a716-446655440008', 'Ensalada Vegetariana Saludable', 'Ensalada mixta con vegetales frescos y aderezo balsámico', 17.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 20, 'Veg', '550e8400-e29b-41d4-a716-446655440004'),
  ('650e8400-e29b-41d4-a716-446655440009', 'Tacos de Pollo a la Parrilla', 'Tacos con pollo marinado, salsa y vegetales frescos', 14.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Non Veg', '550e8400-e29b-41d4-a716-446655440004'),
  ('650e8400-e29b-41d4-a716-446655440010', 'Sushi Maki de Atún', 'Rollos de sushi con atún fresco y vegetales', 9.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Non Veg', '550e8400-e29b-41d4-a716-446655440004'),

  -- Hamburguesas
  ('650e8400-e29b-41d4-a716-446655440011', 'Hamburguesa de Queso Original', 'Hamburguesa clásica con queso, lechuga, tomate y papas fritas', 23.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Non Veg', '550e8400-e29b-41d4-a716-446655440005'),
  ('650e8400-e29b-41d4-a716-446655440012', 'Hamburguesa Vegetariana', 'Hamburguesa de quinoa con vegetales y papas fritas', 10.59, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 20, 'Veg', '550e8400-e29b-41d4-a716-446655440005'),

  -- Bebidas
  ('650e8400-e29b-41d4-a716-446655440013', 'Jugo de Naranja Fresco', 'Jugo de naranja natural con semillas de albahaca', 12.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Veg', '550e8400-e29b-41d4-a716-446655440006'),
  ('650e8400-e29b-41d4-a716-446655440014', 'Café Americano', 'Café negro recién preparado', 4.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 0, 'Veg', '550e8400-e29b-41d4-a716-446655440006'),
  ('650e8400-e29b-41d4-a716-446655440015', 'Smoothie de Frutas Tropicales', 'Batido de mango, piña y coco', 8.99, 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202025-01-12%20at%2012.32.42%20PM-QicgA83ZI0TfZlOynDOqlhOGnbwzEv.jpeg', 15, 'Veg', '550e8400-e29b-41d4-a716-446655440006')
ON CONFLICT (id) DO NOTHING;
