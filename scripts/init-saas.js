const { run, getOne } = require('/var/www/el-inmortal-2-dashboard/src/config/database');
const bcrypt = require('bcryptjs');

console.log('🏗️  Inicializando sistema SaaS...\n');

async function initializeSaas() {
    try {
        // Create users table
        console.log('1. Creando tabla de usuarios...');
        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('super_admin', 'admin', 'artist', 'producer', 'composer', 'label_manager') DEFAULT 'artist',
                company_id INT,
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                last_login TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ Tabla users creada');

        // Create companies table
        console.log('\n2. Creando tabla de empresas...');
        await run(`
            CREATE TABLE IF NOT EXISTS companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                subscription_type ENUM('basic', 'pro', 'enterprise') DEFAULT 'basic',
                subscription_expires DATE,
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ Tabla companies creada');

        // Create system settings table
        console.log('\n3. Creando tabla de configuraciones...');
        await run(`
            CREATE TABLE IF NOT EXISTS system_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                key VARCHAR(100) NOT NULL UNIQUE,
                value TEXT,
                description VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ Tabla system_settings creada');

        // Insert default settings
        console.log('\n4. Insertando configuraciones por defecto...');
        const defaultSettings = [
            { key: 'max_file_size', value: '100', description: 'Tamaño máximo de archivo en MB' },
            { key: 'max_files_per_upload', value: '25', description: 'Máximo de archivos por subida' },
            { key: 'allowed_formats', value: 'wav,mp3,m4a,flac,aac', description: 'Formatos de audio permitidos' },
            { key: 'auto_transcribe', value: '0', description: 'Transcripción automática de letras' },
            { key: 'app_name', value: 'Galante Dashboard', description: 'Nombre de la aplicación' },
            { key: 'app_version', value: '1.0.0', description: 'Versión de la aplicación' }
        ];

        for (const setting of defaultSettings) {
            try {
                await run(
                    'INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = value',
                    [setting.key, setting.value, setting.description]
                );
            } catch (err) {
                // Ignore duplicate errors
            }
        }
        console.log('   ✅ Configuraciones por defecto insertadas');

        // Create default company
        console.log('\n5. Creando empresa por defecto...');
        const existingCompany = await getOne('SELECT id FROM companies WHERE name = ?', ['Galante Records']);
        let companyId;
        
        if (!existingCompany) {
            const result = await run(
                'INSERT INTO companies (name, email, subscription_type, status) VALUES (?, ?, ?, ?)',
                ['Galante Records', 'admin@galante.com', 'enterprise', 'active']
            );
            companyId = result.lastID || result.insertId;
            console.log('   ✅ Empresa por defecto creada (ID: ' + companyId + ')');
        } else {
            companyId = existingCompany.id;
            console.log('   ℹ️  Empresa por defecto ya existe (ID: ' + companyId + ')');
        }

        // Create default admin user
        console.log('\n6. Creando usuario administrador...');
        const existingAdmin = await getOne('SELECT id FROM users WHERE email = ?', ['admin@galante.com']);
        
        if (!existingAdmin) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash('admin123', salt);
            
            await run(
                'INSERT INTO users (name, email, password_hash, role, company_id, status) VALUES (?, ?, ?, ?, ?, ?)',
                ['Administrador', 'admin@galante.com', passwordHash, 'super_admin', companyId, 'active']
            );
            console.log('   ✅ Usuario admin creado');
            console.log('   📧 Email: admin@galante.com');
            console.log('   🔑 Password: admin123');
        } else {
            console.log('   ℹ️  Usuario admin ya existe');
        }

        // Add user_id to tracks table for multi-tenancy
        console.log('\n7. Agregando columna user_id a tracks...');
        try {
            await run('ALTER TABLE tracks ADD COLUMN user_id INT');
            console.log('   ✅ Columna user_id agregada');
        } catch (err) {
            if (err.message.includes('Duplicate column') || err.message.includes('already exists')) {
                console.log('   ℹ️  Columna user_id ya existe');
            } else {
                throw err;
            }
        }

        // Add company_id to tracks table
        console.log('\n8. Agregando columna company_id a tracks...');
        try {
            await run('ALTER TABLE tracks ADD COLUMN company_id INT');
            console.log('   ✅ Columna company_id agregada');
        } catch (err) {
            if (err.message.includes('Duplicate column') || err.message.includes('already exists')) {
                console.log('   ℹ️  Columna company_id ya existe');
            } else {
                throw err;
            }
        }

        console.log('\n🎉 Sistema SaaS inicializado correctamente!');
        console.log('\n📋 Resumen:');
        console.log('   • Tablas creadas: users, companies, system_settings');
        console.log('   • Empresa por defecto: Galante Records');
        console.log('   • Usuario admin: admin@galante.com / admin123');
        console.log('\n🚀 Listo para usar como SaaS multi-tenant');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
    process.exit(0);
}

initializeSaas();
