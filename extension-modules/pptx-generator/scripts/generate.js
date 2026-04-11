#!/usr/bin/env node
// generate.js — pptx-generator core engine (PptxGenJS)
// Usage: node generate.js --input slides.json --out presentation.pptx
//
// Slide types: Cover, TOC, SectionDivider, Content, Summary
// Style recipes: Sharp, Soft, Rounded, Pill

const fs = require('fs');
const path = require('path');

// Dynamic import for ESM-only PptxGenJS
async function main() {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
            opts[args[i].slice(2)] = args[i + 1];
            i++;
        } else if (args[i].startsWith('--')) {
            opts[args[i].slice(2)] = true;
        }
    }

    const inputPath = opts.input;
    const outputPath = opts.out || 'output.pptx';

    if (!inputPath || !fs.existsSync(inputPath)) {
        console.error('ERROR: --input <slides.json> is required and must exist');
        process.exit(1);
    }

    let slidesData;
    try {
        slidesData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    } catch (e) {
        console.error('ERROR: Failed to parse input JSON:', e.message);
        process.exit(2);
    }

    // Import PptxGenJS (try ESM then CJS)
    let PptxGenJS;
    try {
        const mod = await import('pptxgenjs');
        PptxGenJS = mod.default || mod;
    } catch {
        console.error('ERROR: pptxgenjs not installed. Run: npm install pptxgenjs');
        process.exit(2);
    }

    const pptx = new PptxGenJS();
    
    // Apply presentation-level settings
    if (slidesData.layout) {
        pptx.layout = slidesData.layout; // 'LAYOUT_WIDE' or 'LAYOUT_16x9'
    }
    if (slidesData.title) pptx.title = slidesData.title;
    if (slidesData.author) pptx.author = slidesData.author || 'HundunOS';
    if (slidesData.subject) pptx.subject = slidesData.subject;

    // Theme extraction
    const theme = slidesData.theme || {};

    // Process each slide
    const slides = Array.isArray(slidesData) ? slidesData : (slidesData.slides || []);
    for (let idx = 0; idx < slides.length; idx++) {
        const slideDef = slides[idx];
        const slideType = (slideDef.type || 'content').toLowerCase();
        let slide = pptx.addSlide();

        // Apply background
        if (theme.bg) slide.background = { color: theme.bg };
        else if (slideDef.bg) slide.background = { color: slideDef.bg };

        switch (slideType) {
            case 'cover':
                renderCover(slide, slideDef, theme, idx);
                break;
            case 'toc':
                renderTOC(slide, slideDef, theme, idx);
                break;
            case 'section':
            case 'sectiondivider':
                renderSectionDivider(slide, slideDef, theme, idx);
                break;
            case 'summary':
                renderSummary(slide, slideDef, theme, idx);
                break;
            default:
                renderContent(slide, slideDef, theme, idx);
                break;
        }

        // Page number badge (bottom-right)
        addPageNumber(slide, idx + 1, slides.length, theme);
    }

    // Write output
    await pptx.writeFile({ fileName: outputPath });
    // review: removed // review: removed console.log(`OK: Generated ${slides.length} slides -> ${outputPath}`);
}

function renderCover(slide, def, theme, idx) {
    const accent = theme.accent || '#2D5F8A';
    const primary = theme.primary || '#1a1a2e';
    const light = theme.light || '#f5f5f5';

    // Title
    slide.addText(def.title || '', {
        x: 0.5, y: 2.5, w: '90%', h: 1.5,
        fontSize: 44, bold: true, fontFace: def.font || 'Arial',
        color: primary, align: 'center', valign: 'middle'
    });

    // Subtitle
    if (def.subtitle) {
        slide.addText(def.subtitle, {
            x: 0.5, y: 4.0, w: '90%', h: 0.6,
            fontSize: 20, fontFace: 'Arial',
            color: accent, align: 'center'
        });
    }

    // Author / Date line
    const metaLine = [def.author, def.date].filter(Boolean).join('  |  ');
    if (metaLine) {
        slide.addText(metaLine, {
            x: 0.5, y: 4.8, w: '90%', h: 0.4,
            fontSize: 12, fontFace: 'Arial',
            color: '#666666', align: 'center'
        });
    }

    // Decorative accent bar at bottom
    slide.addShape(pptx.ShapeTypes.rect, {
        x: 3.5, y: 5.2, w: 3, h: 0.08,
        fill: { color: accent }
    });
}

function renderTOC(slide, def, theme, idx) {
    const items = def.items || [];
    const accent = theme.accent || '#2D5F8A';

    slide.addText('目录' || def.title || 'Table of Contents', {
        x: 0.8, y: 0.5, w: '85%', h: 0.8,
        fontSize: 32, bold: true, fontFace: 'Arial',
        color: theme.primary || '#1a1a2e'
    });

    // Divider
    slide.addShape(pptx.ShapeTypes.rect, {
        x: 0.8, y: 1.25, w: 2, h: 0.04,
        fill: { color: accent }
    });

    items.forEach((item, i) => {
        const numText = `${i + 1}`;
        slide.addText(numText, {
            x: 0.8, y: 1.7 + i * 0.65, w: 0.6, h: 0.5,
            fontSize: 18, bold: true, fontFace: 'Arial',
            color: accent, valign: 'middle'
        });
        slide.addText(item.text || item, {
            x: 1.5, y: 1.7 + i * 0.65, w: 8, h: 0.5,
            fontSize: 16, fontFace: 'Arial',
            color: '#333333', valign: 'middle'
        });
    });
}

function renderSectionDivider(slide, def, theme, idx) {
    const accent = theme.accent || '#2D5F8A';

    // Large section number or label
    if (def.number || def.label) {
        slide.addText(def.number || def.label, {
            x: 0.5, y: 2.0, w: 9, h: 0.8,
            fontSize: 18, bold: true, fontFace: 'Arial',
            color: accent, align: 'center'
        });
    }

    // Section title
    slide.addText(def.title || '', {
        x: 0.5, y: 2.8, w: 9, h: 1.2,
        fontSize: 40, bold: true, fontFace: 'Arial',
        color: theme.primary || '#1a1a2e', align: 'center'
    });

    // Decorative bar
    slide.addShape(pptx.ShapeTypes.rect, {
        x: 3.5, y: 4.2, w: 3, h: 0.06,
        fill: { color: accent }
    });
}

function renderContent(slide, def, theme, idx) {
    const accent = theme.accent || '#2D5F8A';
    const textColor = theme.text || '#333333';

    // Optional header
    if (def.header) {
        slide.addText(def.header, {
            x: 0.5, y: 0.35, w: 9, h: 0.55,
            fontSize: 24, bold: true, fontFace: 'Arial',
            color: theme.primary || '#1a1a2e'
        });
        // Accent underline
        slide.addShape(pptx.ShapeTypes.rect, {
            x: 0.5, y: 0.88, w: 1.5, h: 0.03,
            fill: { color: accent }
        });
    }

    // Body text (supports array of paragraphs)
    const bodyItems = def.body || [];
    let yPos = def.header ? 1.15 : 0.5;

    bodyItems.forEach((item) => {
        if (typeof item === 'string') {
            slide.addText(item, {
                x: 0.5, y: yPos, w: 9, h: 0.5,
                fontSize: 14, fontFace: 'Arial',
                color: textColor, valign: 'top',
                paraSpaceAfter: 6
            });
            yPos += 0.55;
        } else if (typeof item === 'object') {
            const bullet = item.bullet ? '•  ' : '';
            slide.addText(bullet + (item.text || ''), {
                x: 0.5, y: yPos, w: 9, h: item.h || 0.5,
                fontSize: item.size || 14,
                bold: !!item.bold,
                fontFace: item.font || 'Arial',
                color: item.color || textColor,
                valign: 'top', paraSpaceAfter: 6
            });
            yPos += (item.h || 0.5) + 0.05;
        }
    });

    // Bullet points
    if (def.bullets) {
        def.bullets.forEach((bullet, i) => {
            slide.addText(`•  ${bullet}`, {
                x: 0.7, y: yPos, w: 8.5, h: 0.4,
                fontSize: 13, fontFace: 'Arial',
                color: textColor
            });
            yPos += 0.45;
        });
    }
}

function renderSummary(slide, def, theme, idx) {
    const accent = theme.accent || '#2D5F8A';

    slide.addText(def.title || '总结' || 'Summary', {
        x: 0.5, y: 0.5, w: 9, h: 0.8,
        fontSize: 28, bold: true, fontFace: 'Arial',
        color: theme.primary || '#1a1a2e'
    });

    slide.addShape(pptx.ShapeTypes.rect, {
        x: 0.5, y: 1.2, w: 1.5, h: 0.03,
        fill: { color: accent }
    });

    const points = def.points || def.items || [];
    points.forEach((point, i) => {
        slide.addText(`${i + 1}.  ${point.text || point}`, {
            x: 0.5, y: 1.5 + i * 0.6, w: 9, h: 0.5,
            fontSize: 14, fontFace: 'Arial',
            color: theme.text || '#333333'
        });
    });

    // Thank you / contact
    if (def.closing) {
        slide.addText(def.closing, {
            x: 0.5, y: 4.8, w: 9, h: 0.4,
            fontSize: 14, italic: true, fontFace: 'Arial',
            color: accent, align: 'center'
        });
    }
}

function addPageNumber(slide, current, total, theme) {
    // Standard position: x=9.3", y=5.1" (per design system)
    slide.addText(`${current} / ${total}`, {
        x: 9.0, y: 5.1, w: 0.8, h: 0.3,
        fontSize: 8, fontFace: 'Arial',
        color: '#999999', align: 'right'
    }).name = `page_${current}`;
}

main().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(3);
});
