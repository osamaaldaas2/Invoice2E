import JSZip from 'jszip';
import { BatchResult } from './types';

export class BatchGenerator {
    /**
     * Generate output ZIP with all converted XMLs
     */
    async generateOutputZip(results: BatchResult[]): Promise<Buffer> {
        const zip = new JSZip();

        // Add successful XMLs
        const successfulResults = results.filter(r => r.status === 'success' && r.xmlContent);
        for (const result of successfulResults) {
            const xmlFilename = result.filename.replace('.pdf', '.xml').replace('.PDF', '.xml');
            zip.file(xmlFilename, result.xmlContent!);
        }

        // Add status report
        const report = this.generateStatusReport(results);
        zip.file('conversion_report.txt', report);

        return zip.generateAsync({ type: 'nodebuffer' });
    }

    /**
     * Generate status report for batch
     */
    private generateStatusReport(results: BatchResult[]): string {
        const successful = results.filter(r => r.status === 'success');
        const failed = results.filter(r => r.status === 'failed');

        let report = `Invoice Conversion Batch Report
Generated: ${new Date().toISOString()}

Summary:
- Total Files: ${results.length}
- Successful: ${successful.length}
- Failed: ${failed.length}
- Success Rate: ${results.length > 0 ? Math.round((successful.length / results.length) * 100) : 0}%

`;

        if (successful.length > 0) {
            report += `Successful Conversions:\n`;
            for (const r of successful) {
                // FIX: Use ASCII instead of emoji to avoid encoding issues
                report += `  [OK] ${r.filename}${r.invoiceNumber ? ` (${r.invoiceNumber})` : ''}\n`;
            }
            report += '\n';
        }

        if (failed.length > 0) {
            report += `Failed Conversions:\n`;
            for (const r of failed) {
                // FIX: Use ASCII instead of emoji to avoid encoding issues
                report += `  [FAIL] ${r.filename}: ${r.error}\n`;
            }
        }

        return report;
    }
}

export const batchGenerator = new BatchGenerator();
