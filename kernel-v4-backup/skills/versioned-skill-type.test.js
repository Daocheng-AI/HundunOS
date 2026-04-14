/**
 * 版本化 Skill 类型系统测试
 */

import { describe, it, expect } from 'vitest';
import {
  VersionedSkillType,
  VersionedSkillTypeBuilder
} from './versioned-skill-type.js';
import {
  SkillDefinition,
  SkillType,
  SkillExecutionMode
} from './skill-definition.js';

describe('VersionedSkillType', () => {
  let skillV1, skillV2, skillV3;
  let versionedSkill;

  beforeEach(() => {
    // 创建版本 1 的 Skill
    skillV1 = SkillDefinition.builder()
      .withName('test-skill')
      .withDisplayName('Test Skill v1')
      .withDescription('Test skill version 1')
      .withVersion(1)
      .withType(SkillType.EXECUTE)
      .withParameter({
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        required: true
      })
      .withParameter({
        displayName: 'Timeout',
        name: 'timeout',
        type: 'number',
        required: false,
        default: 30000
      })
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'object'
      })
      .build();

    // 创建版本 2 的 Skill（移除 timeout，新增 limit）
    skillV2 = SkillDefinition.builder()
      .withName('test-skill')
      .withDisplayName('Test Skill v2')
      .withDescription('Test skill version 2')
      .withVersion(2)
      .withType(SkillType.EXECUTE)
      .withParameter({
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        required: true
      })
      .withParameter({
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        required: false,
        default: 10
      })
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'object'
      })
      .build();

    // 创建版本 3 的 Skill（新增 authentication 参数）
    skillV3 = SkillDefinition.builder()
      .withName('test-skill')
      .withDisplayName('Test Skill v3')
      .withDescription('Test skill version 3')
      .withVersion(3)
      .withType(SkillType.EXECUTE)
      .withParameter({
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        required: true
      })
      .withParameter({
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        required: false,
        default: 10
      })
      .withParameter({
        displayName: 'Authentication',
        name: 'authentication',
        type: 'string',
        required: false
      })
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'object'
      })
      .withReturn({
        displayName: 'Metadata',
        name: 'metadata',
        type: 'object'
      })
      .build();

    // 创建版本化 Skill
    versionedSkill = new VersionedSkillType(
      {
        1: skillV1,
        2: skillV2,
        3: skillV3
      },
      {
        name: 'test-skill',
        displayName: 'Test Skill',
        defaultVersion: 2
      }
    );
  });

  it('should create a versioned skill type', () => {
    expect(versionedSkill).toBeDefined();
    expect(versionedSkill.description.name).toBe('test-skill');
    expect(versionedSkill.description.displayName).toBe('Test Skill');
  });

  it('should get latest version', () => {
    expect(versionedSkill.getLatestVersion()).toBe(3);
  });

  it('should get all versions', () => {
    const versions = versionedSkill.getAllVersions();
    expect(versions).toEqual([1, 2, 3]);
  });

  it('should check if version exists', () => {
    expect(versionedSkill.hasVersion(1)).toBe(true);
    expect(versionedSkill.hasVersion(2)).toBe(true);
    expect(versionedSkill.hasVersion(3)).toBe(true);
    expect(versionedSkill.hasVersion(4)).toBe(false);
  });

  it('should get skill definition by version', () => {
    const v1Def = versionedSkill.getSkillDefinition(1);
    expect(v1Def.getVersion()).toBe(1);
    expect(v1Def.getDisplayName()).toBe('Test Skill v1');
    expect(v1Def.getParameter('timeout')).toBeDefined();
    expect(v1Def.getParameter('limit')).toBeUndefined();

    const v2Def = versionedSkill.getSkillDefinition(2);
    expect(v2Def.getVersion()).toBe(2);
    expect(v2Def.getDisplayName()).toBe('Test Skill v2');
    expect(v2Def.getParameter('timeout')).toBeUndefined();
    expect(v2Def.getParameter('limit')).toBeDefined();

    const v3Def = versionedSkill.getSkillDefinition(3);
    expect(v3Def.getVersion()).toBe(3);
    expect(v3Def.getDisplayName()).toBe('Test Skill v3');
    expect(v3Def.getParameter('authentication')).toBeDefined();
    expect(v3Def.getReturn('metadata')).toBeDefined();
  });

  it('should throw error when getting non-existent version', () => {
    expect(() => versionedSkill.getSkillDefinition(4)).toThrow(
      /Version 4 not found/
    );
  });

  it('should get current skill definition', () => {
    const currentDef = versionedSkill.getCurrentSkillDefinition();
    expect(currentDef.getVersion()).toBe(2); // default version
  });

  it('should get latest skill definition', () => {
    const latestDef = versionedSkill.getLatestSkillDefinition();
    expect(latestDef.getVersion()).toBe(3);
  });

  it('should get default skill definition', () => {
    const defaultDef = versionedSkill.getDefaultSkillDefinition();
    expect(defaultDef.getVersion()).toBe(2);
  });

  it('should set current version', () => {
    versionedSkill.setCurrentVersion(3);
    expect(versionedSkill.currentVersion).toBe(3);
    expect(versionedSkill.getCurrentSkillDefinition().getVersion()).toBe(3);
  });

  it('should throw error when setting non-existent version', () => {
    expect(() => versionedSkill.setCurrentVersion(4)).toThrow(
      /Cannot set version 4/
    );
  });

  it('should set default version', () => {
    versionedSkill.setDefaultVersion(3);
    expect(versionedSkill.defaultVersion).toBe(3);
  });

  it('should reset to default version', () => {
    versionedSkill.setCurrentVersion(3);
    versionedSkill.resetToDefaultVersion();
    expect(versionedSkill.currentVersion).toBe(2);
  });

  it('should upgrade to latest version', () => {
    versionedSkill.setCurrentVersion(1);
    versionedSkill.upgradeToLatestVersion();
    expect(versionedSkill.currentVersion).toBe(3);
  });

  it('should get version migration info', () => {
    const migrationInfo = versionedSkill.getVersionMigrationInfo(1, 2);

    expect(migrationInfo.fromVersion).toBe(1);
    expect(migrationInfo.toVersion).toBe(2);
    expect(migrationInfo.isUpgrade).toBe(true);
    expect(migrationInfo.isDowngrade).toBe(false);

    // 检查参数变更
    expect(migrationInfo.parameters.removed).toContain('timeout');
    expect(migrationInfo.parameters.added).toContain('limit');

    // 检查返回值变更
    expect(migrationInfo.returns.added).toHaveLength(0);
    expect(migrationInfo.returns.removed).toHaveLength(0);
  });

  it('should detect breaking changes', () => {
    const migrationInfo = versionedSkill.getVersionMigrationInfo(1, 2);
    
    // timeout 参数被移除，但不是必需的，所以不算破坏性变更
    expect(migrationInfo.breakingChanges).toHaveLength(0);
  });

  it('should detect breaking changes for required parameters', () => {
    // 创建一个移除必需参数的新版本
    const skillV4 = SkillDefinition.builder()
      .withName('test-skill')
      .withDisplayName('Test Skill v4')
      .withDescription('Test skill version 4')
      .withVersion(4)
      .withType(SkillType.EXECUTE)
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'object'
      })
      .build();

    const versionedSkillWithBreakingChange = new VersionedSkillType(
      {
        1: skillV1,
        4: skillV4
      },
      {
        name: 'test-skill',
        displayName: 'Test Skill'
      }
    );

    const migrationInfo = versionedSkillWithBreakingChange.getVersionMigrationInfo(1, 4);
    expect(migrationInfo.breakingChanges).toContain(
      "Required parameter 'apiKey' was removed"
    );
  });

  it('should detect parameter type changes', () => {
    const skillV4 = SkillDefinition.builder()
      .withName('test-skill')
      .withDisplayName('Test Skill v4')
      .withDescription('Test skill version 4')
      .withVersion(4)
      .withType(SkillType.EXECUTE)
      .withParameter({
        displayName: 'API Key',
        name: 'apiKey',
        type: 'number', // Changed from string to number
        required: true
      })
      .withReturn({
        displayName: 'Result',
        name: 'result',
        type: 'object'
      })
      .build();

    const versionedSkillWithTypeChange = new VersionedSkillType(
      {
        1: skillV1,
        4: skillV4
      },
      {
        name: 'test-skill',
        displayName: 'Test Skill'
      }
    );

    const migrationInfo = versionedSkillWithTypeChange.getVersionMigrationInfo(1, 4);
    expect(migrationInfo.breakingChanges).toContain(
      "Parameter 'apiKey' type changed from string to number"
    );
  });

  it('should serialize to JSON', () => {
    const json = versionedSkill.toJSON();

    expect(json.description.name).toBe('test-skill');
    expect(json.currentVersion).toBe(2);
    expect(json.defaultVersion).toBe(2);
    expect(json.skillVersions).toHaveProperty('1');
    expect(json.skillVersions).toHaveProperty('2');
    expect(json.skillVersions).toHaveProperty('3');
  });

  it('should deserialize from JSON', () => {
    const json = versionedSkill.toJSON();
    const deserialized = VersionedSkillType.fromJSON(json);

    expect(deserialized.description.name).toBe('test-skill');
    expect(deserialized.currentVersion).toBe(2);
    expect(deserialized.defaultVersion).toBe(2);
    expect(deserialized.getAllVersions()).toEqual([1, 2, 3]);
  });

  it('should throw error when creating without versions', () => {
    expect(() => new VersionedSkillType({}, {})).toThrow(
      /skillVersions must contain at least one version/
    );
  });

  it('should throw error when version number is invalid', () => {
    const invalidVersions = {
      'invalid': skillV1,
      '-1': skillV2
    };

    expect(() => new VersionedSkillType(invalidVersions, {})).toThrow(
      /Invalid version number/
    );
  });

  it('should throw error when skill definition version does not match key', () => {
    const mismatchedVersions = {
      1: skillV1,
      2: skillV1 // Version 2 key but skillV1 is version 1
    };

    expect(() => new VersionedSkillType(mismatchedVersions, {})).toThrow(
      /does not match key version/
    );
  });
});

describe('VersionedSkillTypeBuilder', () => {
  it('should build a versioned skill type using builder', () => {
    const skillV1 = SkillDefinition.builder()
      .withName('builder-skill')
      .withDisplayName('Builder Skill v1')
      .withDescription('Builder skill version 1')
      .withVersion(1)
      .withType(SkillType.EXECUTE)
      .build();

    const skillV2 = SkillDefinition.builder()
      .withName('builder-skill')
      .withDisplayName('Builder Skill v2')
      .withDescription('Builder skill version 2')
      .withVersion(2)
      .withType(SkillType.EXECUTE)
      .build();

    const versionedSkill = VersionedSkillType.builder({
      name: 'builder-skill',
      displayName: 'Builder Skill',
      defaultVersion: 2
    })
      .withVersion(1, skillV1)
      .withVersion(2, skillV2)
      .build();

    expect(versionedSkill.description.name).toBe('builder-skill');
    expect(versionedSkill.defaultVersion).toBe(2);
    expect(versionedSkill.getAllVersions()).toEqual([1, 2]);
  });

  it('should throw error when adding duplicate version', () => {
    const skillV1 = SkillDefinition.builder()
      .withName('builder-skill')
      .withDisplayName('Builder Skill v1')
      .withDescription('Builder skill version 1')
      .withVersion(1)
      .withType(SkillType.EXECUTE)
      .build();

    expect(() => {
      VersionedSkillType.builder()
        .withVersion(1, skillV1)
        .withVersion(1, skillV1) // Duplicate
        .build();
    }).toThrow(/Version 1 already exists/);
  });

  it('should throw error when skill definition version does not match specified version', () => {
    const skillV1 = SkillDefinition.builder()
      .withName('builder-skill')
      .withDisplayName('Builder Skill v1')
      .withDescription('Builder skill version 1')
      .withVersion(1)
      .withType(SkillType.EXECUTE)
      .build();

    expect(() => {
      VersionedSkillType.builder()
        .withVersion(2, skillV1) // Skill is v1 but specified as v2
        .build();
    }).toThrow(/does not match specified version/);
  });

  it('should throw error when building without versions', () => {
    expect(() => {
      VersionedSkillType.builder().build();
    }).toThrow(/At least one version must be added/);
  });
});
