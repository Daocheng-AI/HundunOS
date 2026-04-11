// hundunos/kernel/prompt-template.js — TaxHacker-inspired Prompt Template System
// 功能：标准化模板变量替换，支持 {fields}/{categories}/{projects} 等占位符
// 灵感来源：TaxHacker lib/ai/prompt.ts 的 buildLLMPrompt()
// 用途：context-enhancer / intent-engine / skill-registry 的统一模板引擎

/**
 * 模板变量替换（正则驱动，非 eval）
 * @param {string} template - 含 {变量} 占位符的模板字符串
 * @param {Record<string, any>} vars - 变量名 → 值 的映射
 * @returns {string} 替换后的字符串
 *
 * @example
 *   const tpl = "字段: {fields}\n类别: {categories}"
 *   const result = replaceTemplate(tpl, {
 *     fields: "- name: 用户名\n- email: 邮箱地址",
 *     categories: "- tech: 技术文档\n- biz: 业务文档"
 *   })
 */
export function replaceTemplate(template, vars) {
    if (!template || typeof template !== 'string') return template || '';
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        const pattern = new RegExp(`\\{${escapeRegex(key)}\\}`, 'g');
        result = result.replace(pattern, value ?? '');
    }
    return result;
}

/**
 * 将字段数组渲染为 LLM prompt 片段
 * TaxHacker 灵感：fields.filter(f => f.llm_prompt).map(f => `- ${f.code}: ${f.llm_prompt}`)
 *
 * @param {Array<{code:string, llm_prompt:string, name?:string, type?:string, isRequired?:boolean}>} fields
 * @param {Object} options
 * @param {boolean} [options.showType=false]    - 是否显示类型标注
 * @param {boolean} [options.showRequired=false]- 是否标注必填字段
 * @param {string}  [options.prefix='- ']       - 每行前缀
 * @returns {string}
 *
 * @example
 *   const fields = [
 *     { code: 'name', llm_prompt: '用户真实姓名', type: 'string', isRequired: true },
 *     { code: 'email', llm_prompt: '邮箱地址', type: 'string', isRequired: false }
 *   ]
 *   // showType=true, showRequired=true
 *   // "- name (string, required): 用户真实姓名\n- email (string): 邮箱地址"
 */
export function renderFieldsToPrompt(fields, options = {}) {
    if (!Array.isArray(fields)) return '';
    const { showType = false, showRequired = false, prefix = '- ' } = options;

    return fields
        .filter(f => f.llm_prompt && typeof f.llm_prompt === 'string')
        .map(f => {
            let line = `${prefix}${f.code}`;
            if (showType && f.type) line += ` (${f.type})`;
            if (showRequired && f.isRequired) line += ' [required]';
            line += `: ${f.llm_prompt}`;
            return line;
        })
        .join('\n');
}

/**
 * 将字段数组转换为 JSON Schema（用于 LLM structured output）
 * TaxHacker 灵感：fieldsToJsonSchema() + withStructuredOutput()
 *
 * @param {Array<{code:string, type:string, llm_prompt:string, isRequired?:boolean, options?:any[]}>} fields
 * @param {Object} options
 * @param {boolean} [options.includeItems=true] - 是否包含 items 数组（发票场景）
 * @returns {Object} JSON Schema object
 *
 * @example
 *   const schema = fieldsToJsonSchema([
 *     { code: 'name', type: 'string', llm_prompt: '用户名', isRequired: true },
 *     { code: 'total', type: 'number', llm_prompt: '总金额', isRequired: true }
 *   ], { includeItems: false })
 *   // => { type: 'object', properties: { name: { type: 'string', description: '用户名' }, ... },
 *   //      required: ['name', 'total'] }
 */
export function fieldsToJsonSchema(fields, options = {}) {
    if (!Array.isArray(fields)) return { type: 'object', properties: {}, required: [] };
    const { includeItems = false } = options;

    const fieldsWithPrompt = fields.filter(f => f.llm_prompt);
    const properties = {};

    for (const field of fieldsWithPrompt) {
        const prop = {
            type: field.type || 'string',
            description: field.llm_prompt || '',
        };
        if (field.options && Array.isArray(field.options)) {
            prop.enum = field.options;
        }
        properties[field.code] = prop;
    }

    const schema = {
        type: 'object',
        properties: { ...properties },
        required: fieldsWithPrompt.filter(f => f.isRequired).map(f => f.code),
        additionalProperties: false,
    };

    // TaxHacker 风格：发票场景包含 items 数组（每行一个商品）
    if (includeItems && Object.keys(properties).length > 0) {
        schema.properties.items = {
            type: 'array',
            description: 'Separate items, products or transactions in the document which have their own name and price or sum.',
            items: {
                type: 'object',
                properties: { ...properties },
                required: [...Object.keys(properties)],
                additionalProperties: false,
            },
        };
        schema.required = [...schema.required, 'items'];
    }

    return schema;
}

/**
 * 构建完整 LLM prompt（TaxHacker buildLLMPrompt 增强版）
 *
 * @param {string} template   - 主模板字符串，支持 {fields}/{categories}/{projects} 等占位符
 * @param {Object} params
 * @param {Array}  [params.fields]    - 字段定义数组
 * @param {Array}  [params.categories]- 类别定义数组
 * @param {Array}  [params.projects]  - 项目定义数组
 * @param {string} [params.extra]     - 额外模板变量（JSON 格式的 key=value 对）
 * @param {Object} [options]
 * @param {boolean} [options.showFieldType=false]
 * @returns {string} 渲染后的完整 prompt
 *
 * @example
 *   const prompt = buildLLMPrompt(
 *     "提取以下信息：\n{fields}\n类别：{categories}",
 *     {
 *       fields: [
 *         { code: 'name', llm_prompt: '用户姓名', type: 'string', isRequired: true },
 *         { code: 'total', llm_prompt: '总金额', type: 'number', isRequired: true }
 *       ],
 *       categories: [
 *         { code: 'food', llm_prompt: '餐饮消费' },
 *         { code: 'travel', llm_prompt: '差旅费用' }
 *       ]
 *     },
 *     { showFieldType: false }
 *   )
 */
export function buildLLMPrompt(template, params = {}, options = {}) {
    if (!template) return '';

    const vars = {};

    // fields: 渲染为 LLM prompt 片段
    if (params.fields) {
        vars.fields = renderFieldsToPrompt(params.fields, options);
        // 同时提供 fields.code 逗号分隔列表
        vars['fields.code'] = params.fields
            .filter(f => f.code)
            .map(f => f.code)
            .join(', ');
    }

    // categories: 渲染为 prompt 片段
    if (params.categories) {
        vars.categories = params.categories
            .filter(c => c.llm_prompt)
            .map(c => `- ${c.code}: for ${c.llm_prompt}`)
            .join('\n');
        vars['categories.code'] = params.categories
            .filter(c => c.code)
            .map(c => c.code)
            .join(', ');
    }

    // projects: 渲染为 prompt 片段
    if (params.projects) {
        vars.projects = params.projects
            .filter(p => p.llm_prompt)
            .map(p => `- ${p.code}: for ${p.llm_prompt}`)
            .join('\n');
        vars['projects.code'] = params.projects
            .filter(p => p.code)
            .map(p => p.code)
            .join(', ');
    }

    // extra: 支持自定义 key=value 对
    if (params.extra && typeof params.extra === 'object') {
        Object.assign(vars, params.extra);
    }

    return replaceTemplate(template, vars);
}

/**
 * 解析 JSON（容错：去除 markdown 代码块包裹）
 * TaxHacker 灵感：llmProvider.ts 中对 openai_compatible 的 JSON.parse 预处理
 *
 * @param {string} raw - LLM 返回的原始字符串
 * @returns {{ success: boolean, data?: any, error?: string }}
 *
 * @example
 *   const { success, data } = parseLLMResponse('```json\n{"name":"张三"}\n```')
 *   // => { success: true, data: { name: '张三' } }
 */
export function parseLLMResponse(raw) {
    if (!raw || typeof raw !== 'string') {
        return { success: false, error: 'Empty or non-string response' };
    }

    let text = raw.trim();

    // 去除 markdown 代码块包裹
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        return { success: true, data: JSON.parse(text) };
    } catch (e) {
        // 尝试修复常见 JSON 格式错误
        try {
            // 尝试用更宽松的方式解析：去除尾部逗号
            const fixed = text.replace(/,(\s*[}\]])/g, '$1');
            return { success: true, data: JSON.parse(fixed) };
        } catch {
            return {
                success: false,
                error: `JSON parse failed: ${e.message}\nRaw: ${text.slice(0, 200)}`
            };
        }
    }
}

// ================================================================
// 内部工具
// ================================================================

/**
 * 转义正则特殊字符
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
