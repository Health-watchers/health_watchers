export interface Patient {
    _id: string;
    systemId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    sex: 'M' | 'F' | 'O';
    contactNumber?: string;
    address?: string;
    gender?: string;
    phone?: string;
}
export declare function formatDate(dateStr: string | undefined): string;
//# sourceMappingURL=index.d.ts.map