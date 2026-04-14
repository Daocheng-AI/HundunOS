/**
 * Skill 迁移示例
 * 演示如何将现有的 YAML Frontmatter Skill 迁移到新的声明式定义系统
 */

import { migrateSkill, migrateSkills } from './skill-migrator.js';
import { SkillDefinitionBuilder, SkillType, SkillExecutionMode } from './skill-definition.js';

/**
 * 示例 1: 迁移单个 Skill
 */
export function migrateResearchSkill() {
  // 原始的 YAML Frontmatter Skill
  const oldResearchSkill = {
    name: 'research',
    description: '跨平台趋势研究工具 - 整合 last30days-skill 能力，提供 Reddit、X、YouTube、HN 等平台的趋势分析',
    priority: 'high',
    version: '1.0.0',
    author: 'HundunOS',
    tags: ['research', 'trends', 'analysis', 'ai'],
    requires: [],
    related_skills: ['search', 'browser']
  };

  // 迁移到新的 SkillDefinition
  const newResearchSkill = migrateSkill(oldResearchSkill);

  // console.log('=== 迁移结果 ===');
  // console.log('名称:', newResearchSkill.getName());
  // console.log('显示名称:', newResearchSkill.getDisplayName());
  // console.log('描述:', newResearchSkill.description.description);
  // console.log('版本:', newResearchSkill.getVersion());
  // console.log('标签:', newResearchSkill.description.tags);
  // console.log('作者:', newResearchSkill.description.author);
  // console.log('分类:', newResearchSkill.description.category);
  // console.log('优先级:', newResearchSkill.description.metadata.priority);
  // console.log('相关 Skills:', newResearchSkill.description.metadata.related_skills);

  return newResearchSkill;
}

/**
 * 示例 2: 迁移多个 Skills
 */
export function migrateMultipleSkills() {
  // 原始的 YAML Frontmatter Skills
  const oldSkills = [
    {
      name: 'research',
      description: '跨平台趋势研究工具',
      version: '1.0.0',
      author: 'HundunOS',
      tags: ['research', 'trends']
    },
    {
      name: 'webhook-integration',
      description: 'Webhook 集成工具',
      version: '2.0.0',
      priority: 'high',
      tags: ['webhook', 'integration'],
      requires: ['http', 'auth']
    },
    {
      name: 'api-client',
      description: '通用 API 客户端',
      version: '1.5.0',
      author: 'Community',
      tags: ['api', 'client', 'http']
    }
  ];

  // 批量迁移
  const result = migrateSkills(oldSkills);

  // console.log('\n=== 批量迁移结果 ===');
  // console.log('总数:', result.total);
  // console.log('成功:', result.successCount);
  // console.log('失败:', result.errorCount);

  if (result.migrated.length > 0) {
    // console.log('\n成功迁移的 Skills:');
    result.migrated.forEach((item, index) => {
      // console.log(`${index + 1}. ${item.oldName} -> ${item.newName}`);
    });
  }

  if (result.errors.length > 0) {
    // console.log('\n失败的迁移:');
    result.errors.forEach((item, index) => {
      // console.log(`${index + 1}. ${item.oldName}: ${item.error}`);
    });
  }

  return result;
}

/**
 * 示例 3: 手动创建 SkillDefinition（不使用迁移工具）
 */
export function createCustomSkillDefinition() {
  // 使用 Builder 模式手动创建 SkillDefinition
  const customSkill = SkillDefinitionBuilder.builder()
    .withName('custom-ai-model')
    .withDisplayName('Custom AI Model')
    .withDescription('自定义 AI 模型集成 Skill')
    .withVersion(1)
    .withType(SkillType.EXECUTE)
    .withExecutionMode(SkillExecutionMode.MANUAL)
    .withCategory('ai')
    .withTag('ai')
    .withTag('machine-learning')
    .withTag('integration')
    .withParameter({
      displayName: 'API Key',
      name: 'apiKey',
      description: 'AI 模型的 API 密钥',
      type: 'string',
      required: true,
      typeOptions: {
        password: true
      }
    })
    .withParameter({
      displayName: 'Model Name',
      name: 'modelName',
      description: '要使用的模型名称',
      type: 'string',
      required: true,
      default: 'gpt-3.5-turbo'
    })
    .withParameter({
      displayName: 'Temperature',
      name: 'temperature',
      description: '生成温度（0.0-1.0）',
      type: 'number',
      required: false,
      default: 0.7,
      typeOptions: {
        minValue: 0,
        maxValue: 1,
        step: 0.1
      }
    })
    .withReturn({
      displayName: 'Response',
      name: 'response',
      description: 'AI 模型的响应',
      type: 'object'
    })
    .withReturn({
      displayName: 'Usage',
      name: 'usage',
      description: 'API 使用统计',
      type: 'object'
    })
    .withCredential({
      name: 'ai-api-credential',
      displayName: 'AI API 凭证',
      description: 'AI API 访问凭证',
      required: true,
      authentication: {
        type: 'headerAuth',
        properties: [
          {
            name: 'apiKey',
            displayName: 'API Key',
            type: 'string',
            required: true,
            typeOptions: {
              password: true
            }
          }
        ]
      }
    })
    .withTool({
      id: 'http-request',
      name: 'HTTP Request',
      description: '发送 HTTP 请求到 AI API',
      type: 'http',
      config: {
        method: 'POST',
        timeout: 30000
      }
    })
    .build();

  // console.log('\n=== 自定义 Skill 定义 ===');
  // console.log('名称:', customSkill.getName());
  // console.log('显示名称:', customSkill.getDisplayName());
  // console.log('描述:', customSkill.description.description);
  // console.log('类型:', customSkill.getType());
  // console.log('执行模式:', customSkill.description.executionMode);
  // console.log('参数数量:', customSkill.parameters.length);
  // console.log('返回值数量:', customSkill.returns.length);
  // console.log('工具数量:', customSkill.tools.length);
  // console.log('必需参数:', customSkill.getRequiredParameters());

  return customSkill;
}

/**
 * 示例 4: 导出迁移后的 Skill 为 JSON
 */
export function exportSkillToJSON(skillDefinition) {
  const json = skillDefinition.toJSON();

  // console.log('\n=== Skill JSON 导出 ===');
  // console.log(JSON.stringify(json, null, 2));

  return json;
}

/**
 * 运行所有示例
 */
export function runAllExamples() {
  // console.log('╔════════════════════════════════════════════════════════════╗');
  // console.log('║  Skill 迁移示例                                            ║');
  // console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 示例 1: 迁移单个 Skill
  // console.log('═══ 示例 1: 迁移单个 Skill ═══');
  const researchSkill = migrateResearchSkill();

  // 示例 2: 迁移多个 Skills
  // console.log('\n═══ 示例 2: 迁移多个 Skills ═══');
  const migrationResult = migrateMultipleSkills();

  // 示例 3: 手动创建 SkillDefinition
  // console.log('\n═══ 示例 3: 手动创建 SkillDefinition ═══');
  const customSkill = createCustomSkillDefinition();

  // 示例 4: 导出 JSON
  // console.log('\n═══ 示例 4: 导出 JSON ═══');
  exportSkillToJSON(customSkill);

  // console.log('\n╔════════════════════════════════════════════════════════════╗');
  // console.log('║  所有示例执行完成                                          ║');
  // console.log('╚════════════════════════════════════════════════════════════╝\n');

  return {
    researchSkill,
    migrationResult,
    customSkill
  };
}

// 如果直接运行此文件，执行所有示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}
