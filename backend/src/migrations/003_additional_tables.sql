-- Tabla: tables (mesas)
CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number TEXT NOT NULL UNIQUE,
  capacity INT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
  current_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: reservations (reservaciones)
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
  reservation_date TIMESTAMP WITH TIME ZONE NOT NULL,
  party_size INT NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: delivery_info (información de entrega)
CREATE TABLE IF NOT EXISTS delivery_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  delivery_fee NUMERIC(10, 2) DEFAULT 0,
  estimated_time INT, -- minutos
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'picked_up', 'delivered')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: settings (configuración del sistema)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices adicionales
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_delivery_info_order_id ON delivery_info(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_info_status ON delivery_info(status);

-- Habilitar RLS para las nuevas tablas
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Access policies are configured by the restricted policies migration.

-- Insertar datos de ejemplo para mesas
INSERT INTO tables (id, number, capacity, status) VALUES
  ('750e8400-e29b-41d4-a716-446655440001', 'Mesa 1', 4, 'available'),
  ('750e8400-e29b-41d4-a716-446655440002', 'Mesa 2', 2, 'available'),
  ('750e8400-e29b-41d4-a716-446655440003', 'Mesa 3', 6, 'available'),
  ('750e8400-e29b-41d4-a716-446655440004', 'Mesa 4', 4, 'occupied'),
  ('750e8400-e29b-41d4-a716-446655440005', 'Mesa 5', 8, 'available'),
  ('750e8400-e29b-41d4-a716-446655440006', 'Mesa 6', 2, 'available'),
  ('750e8400-e29b-41d4-a716-446655440007', 'Mesa 7', 4, 'reserved'),
  ('750e8400-e29b-41d4-a716-446655440008', 'Mesa 8', 6, 'available')
ON CONFLICT (id) DO NOTHING;

-- Insertar configuración inicial
INSERT INTO settings (key, value, description) VALUES
  ('restaurant_name', 'CHILI POS', 'Nombre del restaurante'),
  ('tax_rate', '0.05', 'Tasa de impuesto (5%)'),
  ('delivery_fee', '3.50', 'Tarifa de entrega'),
  ('currency', 'USD', 'Moneda utilizada'),
  ('timezone', 'America/New_York', 'Zona horaria'),
  ('max_table_reservation_days', '30', 'Días máximos para reservar mesa'),
  ('order_preparation_time', '25', 'Tiempo estimado de preparación (minutos)')
ON CONFLICT (key) DO NOTHING;
