#!/usr/bin/env node
/**
 * HundunOS v4 to v5 Migration Verification Script
 * 验证迁移完整性和正确性
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// v4 to v5 module mapping
const MODULE_MAPPING = {
  // Core modules
  'kernel/core.js': {
    v5: 'kernel/core.js',
    status: 'migrated',
    note: 'CoreKernel now uses v5 microkernel'
  },
  'kernel/core.v4.js': {
    v5: 'kernel/core.v4.js',
    status: 'preserved',
    note: 'v4 implementation kept for compatibility'
  },
  
  // Mixins -> Plugins
  'kernel/mixins/CoreMixin.js': {
    v5: 'kernel/v5/plugins/core/LoggerPlugin.js + ConfigPlugin',
    status: 'migrated',
    note: 'Split into separate plugins'
  },
  'kernel/mixins/ModuleMixin.js': {
    v5: 'kernel/v5/plugins/features/*',
    status: 'migrated',
    note: 'Each module is now a plugin'
  },
  'kernel/mixins/ProcessMixin.js': {
    v5: 'kernel/v5/core/Kernel.js + PluginManager.js',
    status: 'migrated',
    note: 'Core functionality moved to microkernel'
  },
  'kernel/mixins/SessionMixin.js': {
    v5: 'kernel/v5/plugins/features/AgentPlugin.js',
    status: 'migrated',
    note: 'Session management in AgentPlugin'
  },
  'kernel/mixins/RestMixin.js': {
    v5: 'kernel/v5/plugins/features/ApiPlugin.js',
    status: 'migrated',
    note: 'REST API functionality in ApiPlugin'
  },
  
  // Features
  'kernel/cache.js': {
    v5: 'kernel/v5/plugins/features/CachePlugin.js',
    status: 'migrated',
    note: 'Enhanced with multi-level cache'
  },
  'kernel/rag.js': {
    v5: 'kernel/v5/plugins/features/RagPlugin.js',
    status: 'migrated',
    note: 'RAG system as plugin'
  },
  'kernel/multi-tenant.js': {
    v5: 'kernel/v5/plugins/features/TenantPlugin.js',
    status: 'migrated',
    note: 'Multi-tenancy support'
  },
  'kernel/model-router/': {
    v5: 'kernel/v5/plugins/features/ModelRouterPlugin.js',
    status: 'migrated',
    note: 'Model routing with providers'
  },
  
  // Core systems
  'kernel/core/event-bus.js': {
    v5: 'kernel/v5/core/EventBus.js',
    status: 'migrated',
    note: 'Enhanced event system'
  },
  'kernel/core/router.js': {
    v5: 'kernel/v5/core/ServiceRegistry.js',
    status: 'migrated',
    note: 'Service registry pattern'
  },
  'kernel/di/container.js': {
    v5: 'kernel/v5/core/ServiceRegistry.js',
    status: 'migrated',
    note: 'Dependency injection'
  },
  
  // Config
  'kernel/config/config-loader.js': {
    v5: 'kernel/v5/core/ConfigManager.js',
    status: 'migrated',
    note: 'Configuration management'
  },
  
  // Logger
  'kernel/logger.js': {
    v5: 'kernel/v5/plugins/core/LoggerPlugin.js',
    status: 'migrated',
    note: 'Structured logging'
  }
};

class MigrationVerifier {
  constructor() {
    this.report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        migrated: 0,
        preserved: 0,
        missing: 0,
        errors: []
      },
      details: []
    };
  }

  async verify() {
    console.log('🔍 Starting Migration Verification...\n');
    
    // 1. Verify v4 backup exists
    this.verifyBackup();
    
    // 2. Verify v5 structure
    this.verifyV5Structure();
    
    // 3. Verify module mapping
    this.verifyModuleMapping();
    
    // 4. Verify API compatibility
    await this.verifyAPICompatibility();
    
    // 5. Check for missing modules
    this.checkMissingModules();
    
    // 6. Generate report
    this.generateReport();
    
    return this.report;
  }

  verifyBackup() {
    console.log('📦 Checking v4 backup...');
    const backupPath = join(PROJECT_ROOT, 'kernel-v4-backup');
    
    if (!existsSync(backupPath)) {
      this.report.summary.errors.push('v4 backup not found');
      console.log('  ❌ v4 backup missing');
    } else {
      const files = this.countFiles(backupPath);
      console.log(`  ✅ v4 backup exists (${files} files)`);
    }
    console.log();
  }

  verifyV5Structure() {
    console.log('🏗️  Checking v5 structure...');
    const v5Path = join(PROJECT_ROOT, 'kernel', 'v5');
    
    const requiredDirs = [
      'core',
      'plugins/core',
      'plugins/features',
      'compat',
      'tests'
    ];
    
    for (const dir of requiredDirs) {
      const fullPath = join(v5Path, dir);
      if (existsSync(fullPath)) {
        const files = this.countFiles(fullPath);
        console.log(`  ✅ ${dir}/ (${files} files)`);
      } else {
        this.report.summary.errors.push(`Missing v5 directory: ${dir}`);
        console.log(`  ❌ ${dir}/ missing`);
      }
    }
    console.log();
  }

  verifyModuleMapping() {
    console.log('🗺️  Verifying module mapping...');
    
    for (const [v4Path, mapping] of Object.entries(MODULE_MAPPING)) {
      this.report.summary.total++;
      
      const v4FullPath = join(PROJECT_ROOT, 'kernel-v4-backup', v4Path.replace('kernel/', ''));
      const v5FullPath = join(PROJECT_ROOT, mapping.v5.split(' ')[0]);
      
      const v4Exists = existsSync(v4FullPath);
      const v5Exists = existsSync(v5FullPath);
      
      const status = v5Exists ? '✅' : '❌';
      console.log(`  ${status} ${v4Path} → ${mapping.v5}`);
      
      if (mapping.status === 'migrated' && v5Exists) {
        this.report.summary.migrated++;
      } else if (mapping.status === 'preserved' && v4Exists) {
        this.report.summary.preserved++;
      } else if (!v5Exists) {
        this.report.summary.missing++;
        this.report.summary.errors.push(`Missing v5 module: ${mapping.v5}`);
      }
      
      this.report.details.push({
        v4: v4Path,
        v5: mapping.v5,
        status: mapping.status,
        v4Exists,
        v5Exists,
        note: mapping.note
      });
    }
    console.log();
  }

  async verifyAPICompatibility() {
    console.log('🔌 Verifying API compatibility...');
    
    try {
      // Test v5 exports
      const v5 = await import(join(PROJECT_ROOT, 'kernel/v5/index.js'));
      const v5Exports = Object.keys(v5);
      
      console.log(`  ✅ v5 exports: ${v5Exports.length} items`);
      
      // Test main exports
      const main = await import(join(PROJECT_ROOT, 'index.js'));
      const mainExports = Object.keys(main);
      
      console.log(`  ✅ Main exports: ${mainExports.length} items`);
      
      // Check required exports
      const required = [
        'CoreKernel',
        'createKernel',
        'Kernel',
        'BasePlugin',
        'LoggerPlugin'
      ];
      
      for (const item of required) {
        if (mainExports.includes(item)) {
          console.log(`  ✅ ${item} exported`);
        } else {
          this.report.summary.errors.push(`Missing export: ${item}`);
          console.log(`  ❌ ${item} missing`);
        }
      }
      
    } catch (err) {
      this.report.summary.errors.push(`API verification failed: ${err.message}`);
      console.log(`  ❌ API verification failed: ${err.message}`);
    }
    console.log();
  }

  checkMissingModules() {
    console.log('🔎 Checking for missing modules...');
    
    // Check if important v4 modules are mapped
    const v4Root = join(PROJECT_ROOT, 'kernel-v4-backup');
    const importantModules = [
      'core.js',
      'core.v4.js',
      'rag.js',
      'cache.js',
      'multi-tenant.js',
      'logger.js'
    ];
    
    for (const mod of importantModules) {
      const v4Path = join(v4Root, mod);
      if (existsSync(v4Path)) {
        const mapped = Object.keys(MODULE_MAPPING).some(k => k.includes(mod));
        if (mapped) {
          console.log(`  ✅ ${mod} mapped`);
        } else {
          console.log(`  ⚠️  ${mod} not in mapping (may need manual check)`);
        }
      }
    }
    console.log();
  }

  countFiles(dir) {
    let count = 0;
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        count += this.countFiles(fullPath);
      } else if (stat.isFile()) {
        count++;
      }
    }
    
    return count;
  }

  generateReport() {
    console.log('📊 Migration Verification Report');
    console.log('================================\n');
    
    console.log('Summary:');
    console.log(`  Total modules checked: ${this.report.summary.total}`);
    console.log(`  Successfully migrated: ${this.report.summary.migrated}`);
    console.log(`  Preserved (v4): ${this.report.summary.preserved}`);
    console.log(`  Missing: ${this.report.summary.missing}`);
    console.log(`  Errors: ${this.report.summary.errors.length}`);
    console.log();
    
    if (this.report.summary.errors.length > 0) {
      console.log('Errors:');
      for (const error of this.report.summary.errors) {
        console.log(`  ❌ ${error}`);
      }
      console.log();
    }
    
    // Save report
    const reportPath = join(PROJECT_ROOT, 'verification-report.json');
    writeFileSync(reportPath, JSON.stringify(this.report, null, 2));
    console.log(`📄 Report saved to: ${reportPath}`);
    
    // Return status
    const success = this.report.summary.errors.length === 0;
    console.log(`\n${success ? '✅' : '❌'} Verification ${success ? 'PASSED' : 'FAILED'}`);
    
    return success;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new MigrationVerifier();
  verifier.verify().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
}

export { MigrationVerifier };
