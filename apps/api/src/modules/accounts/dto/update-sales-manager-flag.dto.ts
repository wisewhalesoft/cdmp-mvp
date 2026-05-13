import { IsBoolean, IsNotEmpty } from 'class-validator';

// F008 v3.2 AC-8 / BR-9 / BR-10:
// PATCH /api/accounts/:id/sales-manager-flag
// Request Body: { isSalesManager: boolean }
export class UpdateSalesManagerFlagDto {
  @IsBoolean({ message: 'isSalesManager 必須為布林值' })
  @IsNotEmpty({ message: 'isSalesManager 必須為布林值' })
  isSalesManager: boolean;
}
