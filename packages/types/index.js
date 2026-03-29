export function formatDate(dateStr) {
    if (!dateStr)
        return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
//# sourceMappingURL=index.js.map