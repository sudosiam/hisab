import {
  addProductCategory,
  deleteProductCategory,
  getProductCategories,
} from '../services/inventory';
import {
  addExpenseCategory,
  deleteExpenseCategory,
  getExpenseCategories,
} from '../services/banking';
import {
  addOtherIncomeCategory,
  deleteOtherIncomeCategory,
  getOtherIncomeCategories,
} from '../services/otherIncome';

export interface CategoryPickerSource {
  loadCategories: () => Promise<string[]>;
  addCategory: (name: string) => Promise<void>;
  deleteCategory: (name: string) => Promise<void>;
  deleteMessage: (name: string) => string;
}

export const productCategorySource: CategoryPickerSource = {
  loadCategories: getProductCategories,
  addCategory: addProductCategory,
  deleteCategory: deleteProductCategory,
  deleteMessage: (name) =>
    `Remove "${name}"? Products in this category will become uncategorized.`,
};

export const expenseCategorySource: CategoryPickerSource = {
  loadCategories: getExpenseCategories,
  addCategory: addExpenseCategory,
  deleteCategory: deleteExpenseCategory,
  deleteMessage: (name) =>
    `Remove "${name}" from expense categories? Past expenses keep their category.`,
};

export const otherIncomeCategorySource: CategoryPickerSource = {
  loadCategories: getOtherIncomeCategories,
  addCategory: addOtherIncomeCategory,
  deleteCategory: deleteOtherIncomeCategory,
  deleteMessage: (name) =>
    `Remove "${name}" from income categories? Past entries keep their category.`,
};
