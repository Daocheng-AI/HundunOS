#!/usr/bin/env node
/**
 * HundunOS v4 to v5 Migration Script
 * 自动迁移工具：将v4 Mixin架构代码迁移到v5 Plugin架构
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Migration rules
const MIGRATION_RULES = {
  // Import transformations
  imports: {
    'from \'./core.js\'': 'from \'./kernel/v5/index.js\'',
    'from \'./core.v4.js\'': 'from \'./kernel/v5/index.js\'',
    'from \'./kernel/core.js\'': 'from \'./kernel/v5/index.js\'',
    'from \'./mixins/index.js\'': 'from \'./kernel/v5/index.js\'',
  },
  
  // Class transformations
  classes: {
    'extends.*Mixin': 'extends BasePlugin',
    'new CoreKernel': 'createKernel',
    'CoreKernelV4': 'Kernel',
  },
  
  // Method transformations
  methods: {
    'initialize\\(\\)': 'initialize',
    'onPhase\\(': 'kernel.events.on(',
    'useMixin\\(': 'kernel.plugins.register(',
    'getMixin\\(': 'kernel.plugins.get(',
    'register\\(': 'kernel.services.register(',
    'get\\(': 'kernel.get(',
  },
  
  // Property transformations
  properties: {
    'this\\.config\\.': 'kernel.config.get(',
    'this\\.getLogger\\(': 'kernel.get(\'logger\').child(',
    'this\\.emit\\(': 'kernel.events.emit(',
    'this\\.on\\(': 'kernel.events.on(',
  }
};

class MigrationTool {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      errors: []
    };
  }

  /**
   * Main migration entry
   */
  async migrate(options = {}) {
    console.log('🚀 Starting HundunOS v4 to v5 Migration...\n');
    
    const sourceDir = options.source || join(PROJECT_ROOT, 'kernel');
    const targetDir = options.target || join(PROJECT_ROOT, 'kernel', 'v5', 'migrated');
    
    // Create target directory
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    
    // Process all JS files
    await this.processDirectory(sourceDir, targetDir);
    
    // Generate migration report
    this.generateReport();
    
    console.log('\n✅ Migration completed!');
    console.log(`📊 Files processed: ${this.stats.filesProcessed}`);
    console.log(`📝 Files modified: ${this.stats.filesModified}`);
    console.log(`❌ Errors: ${this.stats.errors.length}`);
  }

  /**
   * Process directory recursively
   */
  async processDirectory(sourceDir, targetDir) {
    const entries = readdirSync(sourceDir);
    
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry);
      const targetPath = join(targetDir, entry);
      const stat = statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // Skip v5 directory and node_modules
        if (entry === 'v5' || entry === 'node_modules' || entry === '__tests__') {
          continue;
        }
        
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
        
        await this.processDirectory(sourcePath, targetPath);
      } else if (stat.isFile() && extname(entry) === '.js') {
        await this.processFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Process single file
   */
  async processFile(sourcePath, targetPath) {
    this.stats.filesProcessed++;
    
    try {
      let content = readFileSync(sourcePath, 'utf-8');
      let modified = false;
      
      // Apply migration rules
      for (const [category, rules] of Object.entries(MIGRATION_RULES)) {
        for (const [pattern, replacement] of Object.entries(rules)) {
          const regex = new RegExp(pattern, 'g');
          if (regex.test(content)) {
            content = content.replace(regex, replacement);
            modified = true;
          }
        }
      }
      
      // Add v5 imports if needed
      if (modified && !content.includes('from \'./kernel/v5/index.js\'')) {
        content = this.addV5Imports(content);
      }
      
      // Transform Mixin to Plugin
      if (content.includes('extends') && content.includes('Mixin')) {
        content = this.transformMixinToPlugin(content, sourcePath);
        modified = true;
      }
      
      // Write modified file
      if (modified) {
        writeFileSync(targetPath, content, 'utf-8');
        this.stats.filesModified++;
        console.log(`✓ Migrated: ${relative(PROJECT_ROOT, sourcePath)}`);
      } else {
        // Copy unchanged
        writeFileSync(targetPath, content, 'utf-8');
      }
      
    } catch (err) {
      this.stats.errors.push({
        file: sourcePath,
        error: err.message
      });
      console.error(`✗ Error: ${relative(PROJECT_ROOT, sourcePath)} - ${err.message}`);
    }
  }

  /**
   * Add v5 imports to file
   */
  addV5Imports(content) {
    const v5Import = `import {
  createKernel,
  BasePlugin,
  LoggerPlugin,
  SecurityPlugin,
  ConfigPlugin,
  EventsPlugin,
  CachePlugin,
  DatabasePlugin,
  ApiPlugin,
  ModelRouterPlugin,
  AgentPlugin,
  RagPlugin,
  TenantPlugin,
  BillingPlugin
} from './kernel/v5/index.js';\n\n`;
    
    // Find first import or start of file
    const firstImport = content.match(/^import/m);
    if (firstImport) {
      const insertPos = firstImport.index;
      return content.slice(0, insertPos) + v5Import + content.slice(insertPos);
    }
    
    return v5Import + content;
  }

  /**
   * Transform Mixin class to Plugin class
   */
  transformMixinToPlugin(content, filePath) {
    const className = basename(filePath, '.js');
    const pluginName = className.replace(/Mixin$/, 'Plugin');
    
    // Replace class declaration
    content = content.replace(
      /class\s+(\w+)Mixin\s+extends\s+[^\{]+/,
      `class ${pluginName} extends BasePlugin`
    );
    
    // Add plugin metadata
    if (!content.includes('get name()')) {
      const nameGetter = `
  get name() {
    return '${pluginName.toLowerCase()}';
  }

  get version() {
    return '1.0.0';
  }

  get dependencies() {
    return ['logger'];
  }
`;
      
      // Insert after class declaration
      content = content.replace(
        /(class\s+\w+Plugin\s+extends\s+BasePlugin\s*\{)/,
        `$1${nameGetter}`
      );
    }
    
    // Transform init methods to onInit
    content = content.replace(
      /async\s+init_\w+\s*\([^)]*\)\s*\{/g,
      'async onInit() {'
    );
    
    // Transform this references to kernel
    content = content.replace(
      /this\.(config|logger|events)\./g,
      'kernel.$1.'
    );
    
    return content;
  }

  /**
   * Generate migration report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      summary: {
        totalFiles: this.stats.filesProcessed,
        modifiedFiles: this.stats.filesModified,
        successRate: this.stats.filesProcessed > 0 
          ? ((this.stats.filesProcessed - this.stats.errors.length) / this.stats.filesProcessed * 100).toFixed(2)
          : 0
      }
    };
    
    const reportPath = join(PROJECT_ROOT, 'migration-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Migration report saved to: ${reportPath}`);
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const tool = new MigrationTool();
  
  const options = {
    source: process.argv[2],
    target: process.argv[3]
  };
  
  tool.migrate(options).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

export { MigrationTool };
