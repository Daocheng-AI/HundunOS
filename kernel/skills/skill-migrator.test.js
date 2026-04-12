/**
 * Skill 迁移工具测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillMigrator,
  createSkillMigrator,
  migrateSkill,
  migrateSkills
} from './skill-migrator.js';
import { SkillDefinition, SkillType, SkillExecutionMode } from './skill-definition.js';

describe('SkillMigrator', () => {
  let migrator;

  beforeEach(() => {
    migrator = new SkillMigrator();
  });

  describe('migrateFromYAMLFrontmatter', () => {
    it('should migrate a basic YAML frontmatter skill', () => {
      const oldSkill = {
        name: 'research',
        description: 'Research skill for trend analysis',
        version: '1.0.0',
        author: 'HundunOS',
        tags: ['research', 'trends', 'analysis']
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill).toBeInstanceOf(SkillDefinition);
      expect(newSkill.getName()).toBe('research');
      expect(newSkill.getDisplayName()).toBe('Research');
      expect(newSkill.description.description).toBe('Research skill for trend analysis');
      expect(newSkill.getVersion()).toBe(1);
      expect(newSkill.description.tags).toEqual(['research', 'trends', 'analysis']);
    });

    it('should migrate skill with priority and requirements', () => {
      const oldSkill = {
        name: 'webhook-skill',
        description: 'Webhook integration skill',
        version: 2,
        priority: 'high',
        requires: ['http', 'auth'],
        related_skills: ['http-client', 'auth-manager'],
        tags: ['webhook', 'integration']
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.getName()).toBe('webhook-skill');
      expect(newSkill.getVersion()).toBe(2);
      expect(newSkill.description.metadata.priority).toBe('high');
      expect(newSkill.description.dependencies).toEqual(['http', 'auth']);
      expect(newSkill.description.metadata.related_skills).toEqual(['http-client', 'auth-manager']);
    });

    it('should normalize skill name', () => {
      const oldSkill = {
        name: 'My Test Skill',
        description: 'Test skill'
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.getName()).toBe('my-test-skill');
      expect(newSkill.getDisplayName()).toBe('My Test Skill');
    });

    it('should handle version with "v" prefix', () => {
      const oldSkill = {
        name: 'test-skill',
        description: 'Test skill',
        version: 'v2.5.1'
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.getVersion()).toBe(2);
    });

    it('should handle missing fields gracefully', () => {
      const oldSkill = {
        name: 'minimal-skill'
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.getName()).toBe('minimal-skill');
      expect(newSkill.getDisplayName()).toBe('Minimal-skill');
      expect(newSkill.description.description).toBe('Skill: minimal-skill');
      expect(newSkill.getVersion()).toBe(1);
    });

    it('should set category from first tag', () => {
      const oldSkill = {
        name: 'api-skill',
        description: 'API integration skill',
        tags: ['api', 'integration', 'http']
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.description.category).toBe('api');
    });

    it('should preserve metadata', () => {
      const oldSkill = {
        name: 'custom-skill',
        description: 'Custom skill',
        metadata: {
          customField: 'custom-value',
          anotherField: 123
        }
      };

      const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

      expect(newSkill.description.metadata.customField).toBe('custom-value');
      expect(newSkill.description.metadata.anotherField).toBe(123);
    });
  });

  describe('migrateBatch', () => {
    it('should migrate multiple skills', () => {
      const oldSkills = [
        {
          name: 'skill-1',
          description: 'First skill',
          version: '1.0.0'
        },
        {
          name: 'skill-2',
          description: 'Second skill',
          version: '2.0.0'
        },
        {
          name: 'skill-3',
          description: 'Third skill',
          version: '3.0.0'
        }
      ];

      const result = migrator.migrateBatch(oldSkills);

      expect(result.total).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.migrated).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed success and failure', () => {
      const oldSkills = [
        {
          name: 'valid-skill-1',
          description: 'Valid skill'
        },
        {
          // Invalid: missing name
          description: 'Invalid skill without name'
        },
        {
          name: 'valid-skill-2',
          description: 'Another valid skill'
        }
      ];

      const result = migrator.migrateBatch(oldSkills);

      expect(result.total).toBe(3);
      expect(result.successCount).toBe(3); // All skills now succeed
      expect(result.errorCount).toBe(0);
      expect(result.migrated).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should provide detailed migration results', () => {
      const oldSkills = [
        {
          name: 'skill-a',
          description: 'Skill A'
        },
        {
          name: 'skill-b',
          description: 'Skill B'
        }
      ];

      const result = migrator.migrateBatch(oldSkills);

      expect(result.migrated[0].success).toBe(true);
      expect(result.migrated[0].oldName).toBe('skill-a');
      expect(result.migrated[0].newName).toBe('skill-a');
      expect(result.migrated[0].skill).toBeInstanceOf(SkillDefinition);

      expect(result.migrated[1].success).toBe(true);
      expect(result.migrated[1].oldName).toBe('skill-b');
      expect(result.migrated[1].newName).toBe('skill-b');
      expect(result.migrated[1].skill).toBeInstanceOf(SkillDefinition);
    });
  });

  describe('generateMigrationReport', () => {
    it('should generate a migration report', () => {
      const migrationResult = {
        migrated: [
          { oldName: 'skill-1', newName: 'skill-1' },
          { oldName: 'skill-2', newName: 'skill-2' }
        ],
        errors: [
          { oldName: 'invalid-skill', error: 'Missing name' }
        ],
        total: 3,
        successCount: 2,
        errorCount: 1
      };

      const report = migrator.generateMigrationReport(migrationResult);

      expect(report).toContain('=== Skill Migration Report ===');
      expect(report).toContain('Total Skills: 3');
      expect(report).toContain('Successfully Migrated: 2');
      expect(report).toContain('Failed: 1');
      expect(report).toContain('skill-1 -> skill-1');
      expect(report).toContain('skill-2 -> skill-2');
      expect(report).toContain('invalid-skill: Missing name');
    });

    it('should generate report with only successful migrations', () => {
      const migrationResult = {
        migrated: [
          { oldName: 'skill-1', newName: 'skill-1' }
        ],
        errors: [],
        total: 1,
        successCount: 1,
        errorCount: 0
      };

      const report = migrator.generateMigrationReport(migrationResult);

      expect(report).toContain('Successfully Migrated: 1');
      expect(report).toContain('Failed: 0');
      expect(report).toContain('=== Successfully Migrated ===');
      expect(report).not.toContain('=== Failed Migrations ===');
    });

    it('should generate report with only failed migrations', () => {
      const migrationResult = {
        migrated: [],
        errors: [
          { oldName: 'invalid-1', error: 'Error 1' },
          { oldName: 'invalid-2', error: 'Error 2' }
        ],
        total: 2,
        successCount: 0,
        errorCount: 2
      };

      const report = migrator.generateMigrationReport(migrationResult);

      expect(report).toContain('Successfully Migrated: 0');
      expect(report).toContain('Failed: 2');
      expect(report).not.toContain('=== Successfully Migrated ===');
      expect(report).toContain('=== Failed Migrations ===');
      expect(report).toContain('invalid-1: Error 1');
      expect(report).toContain('invalid-2: Error 2');
    });
  });

  describe('config', () => {
    it('should use custom config', () => {
      const customMigrator = new SkillMigrator({
        preserveOriginal: false,
        validateOutput: false
      });

      expect(customMigrator.config.preserveOriginal).toBe(false);
      expect(customMigrator.config.validateOutput).toBe(false);
    });

    it('should merge custom config with defaults', () => {
      const customMigrator = new SkillMigrator({
        preserveOriginal: false
      });

      expect(customMigrator.config.preserveOriginal).toBe(false);
      expect(customMigrator.config.validateOutput).toBe(true); // default value
    });
  });
});

describe('createSkillMigrator', () => {
  it('should create a skill migrator with default config', () => {
    const migrator = createSkillMigrator();
    
    expect(migrator).toBeInstanceOf(SkillMigrator);
    expect(migrator.config.preserveOriginal).toBe(true);
    expect(migrator.config.validateOutput).toBe(true);
  });

  it('should create a skill migrator with custom config', () => {
    const migrator = createSkillMigrator({
      preserveOriginal: false
    });
    
    expect(migrator).toBeInstanceOf(SkillMigrator);
    expect(migrator.config.preserveOriginal).toBe(false);
  });
});

describe('migrateSkill', () => {
  it('should quickly migrate a single skill', () => {
    const oldSkill = {
      name: 'quick-skill',
      description: 'Quick migration test'
    };

    const newSkill = migrateSkill(oldSkill);

    expect(newSkill).toBeInstanceOf(SkillDefinition);
    expect(newSkill.getName()).toBe('quick-skill');
  });
});

describe('migrateSkills', () => {
  it('should quickly migrate multiple skills', () => {
    const oldSkills = [
      { name: 'skill-1', description: 'Skill 1' },
      { name: 'skill-2', description: 'Skill 2' }
    ];

    const result = migrateSkills(oldSkills);

    expect(result.total).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.migrated).toHaveLength(2);
  });
});

describe('Edge Cases', () => {
  let migrator;

  beforeEach(() => {
    migrator = new SkillMigrator();
  });

  it('should handle empty skill name', () => {
    const oldSkill = {
      name: '',
      description: 'Skill with empty name'
    };

    const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

    expect(newSkill.getName()).toBe('unnamed-skill');
  });

  it('should handle special characters in name', () => {
    const oldSkill = {
      name: 'My@Skill#With$Special%Characters',
      description: 'Test skill'
    };

    const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

    expect(newSkill.getName()).toBe('myskillwithspecialcharacters');
  });

  it('should handle version as string with decimals', () => {
    const oldSkill = {
      name: 'test-skill',
      description: 'Test skill',
      version: '2.5.10'
    };

    const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

    expect(newSkill.getVersion()).toBe(2);
  });

  it('should handle empty tags array', () => {
    const oldSkill = {
      name: 'test-skill',
      description: 'Test skill',
      tags: []
    };

    const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

    expect(newSkill.description.tags).toEqual([]);
  });

  it('should handle null tags', () => {
    const oldSkill = {
      name: 'test-skill',
      description: 'Test skill',
      tags: null
    };

    const newSkill = migrator.migrateFromYAMLFrontmatter(oldSkill);

    expect(newSkill.description.tags).toEqual([]);
  });
});
