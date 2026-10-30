import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { STORAGE_UNIT_TYPES, type StorageUnitType } from "@frostguard/shared";
import { toast } from "sonner";
import { Button, Field, Input, Modal, Select, Switch, Textarea } from "@/components/ui";
import { api, apiErrorMessage } from "@/lib/api";
import { humanize, toNumber } from "@/lib/format";
import type { Product } from "@/lib/types";

interface ProductFormState {
  code: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  storageType: StorageUnitType;
  minTemp: string;
  maxTemp: string;
  isActive: boolean;
}

type ProductFormErrors = Partial<Record<keyof ProductFormState, string>>;

interface ProductPayload {
  code: string;
  name: string;
  category: string;
  manufacturer: string | null;
  description: string | null;
  storageType: StorageUnitType;
  minTemp: number;
  maxTemp: number;
  isActive: boolean;
}

const EMPTY_FORM: ProductFormState = {
  code: "",
  name: "",
  category: "",
  manufacturer: "",
  description: "",
  storageType: "FRIDGE",
  minTemp: "",
  maxTemp: "",
  isActive: true,
};

function toStorageType(value: string): StorageUnitType {
  return (STORAGE_UNIT_TYPES as readonly string[]).includes(value) ? (value as StorageUnitType) : "FRIDGE";
}

function formFromProduct(product: Product | null): ProductFormState {
  if (!product) return { ...EMPTY_FORM };
  return {
    code: product.code,
    name: product.name,
    category: product.category,
    manufacturer: product.manufacturer ?? "",
    description: product.description ?? "",
    storageType: toStorageType(product.storageType),
    minTemp: toNumber(product.minTemp)?.toString() ?? "",
    maxTemp: toNumber(product.maxTemp)?.toString() ?? "",
    isActive: product.isActive,
  };
}

function validate(form: ProductFormState): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const code = form.code.trim();
  const name = form.name.trim();
  const category = form.category.trim();

  if (!code) errors.code = "Product code is required";
  else if (code.length < 2) errors.code = "Use at least 2 characters";
  else if (code.length > 40) errors.code = "Keep the code under 40 characters";
  else if (!/^[A-Z0-9][A-Z0-9-]*$/i.test(code)) errors.code = "Use letters, digits and dashes only";

  if (!name) errors.name = "Product name is required";
  else if (name.length < 2) errors.name = "Use at least 2 characters";
  else if (name.length > 160) errors.name = "Keep the name under 160 characters";

  if (!category) errors.category = "Category is required";
  else if (category.length < 2) errors.category = "Use at least 2 characters";
  else if (category.length > 80) errors.category = "Keep the category under 80 characters";

  if (form.manufacturer.trim().length > 160) errors.manufacturer = "Keep the manufacturer under 160 characters";
  if (form.description.trim().length > 1000) errors.description = "Keep the description under 1000 characters";

  const min = Number(form.minTemp);
  const max = Number(form.maxTemp);
  const minValid = form.minTemp.trim() !== "" && Number.isFinite(min);
  const maxValid = form.maxTemp.trim() !== "" && Number.isFinite(max);

  if (!minValid) errors.minTemp = "Enter a valid minimum temperature";
  else if (min < -90 || min > 40) errors.minTemp = "Must be between -90 and 40 °C";

  if (!maxValid) errors.maxTemp = "Enter a valid maximum temperature";
  else if (max < -90 || max > 40) errors.maxTemp = "Must be between -90 and 40 °C";

  if (minValid && maxValid && min >= max) errors.minTemp = "Minimum temperature must be below the maximum";

  return errors;
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  categories = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  categories?: string[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(() => formFromProduct(product));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const isEdit = Boolean(product);

  const mutation = useMutation({
    mutationFn: (payload: ProductPayload) =>
      product
        ? api.patch<Product>(`/products/${product.id}`, payload)
        : api.post<Product>("/products", payload),
    onSuccess: () => {
      toast.success(isEdit ? "Product updated" : "Product created", {
        description: form.name.trim(),
      });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (error) => {
      const message = apiErrorMessage(error);
      setServerError(message);
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!open) return;
    setForm(formFromProduct(product));
    setErrors({});
    setServerError(null);
  }, [open, product]);

  function update<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const nextErrors = validate(form);
    setErrors(nextErrors);

    const min = Number(form.minTemp);
    const max = Number(form.maxTemp);
    if (Object.keys(nextErrors).length > 0 || !Number.isFinite(min) || !Number.isFinite(max)) return;

    mutation.mutate({
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category.trim(),
      manufacturer: form.manufacturer.trim() || null,
      description: form.description.trim() || null,
      storageType: form.storageType,
      minTemp: min,
      maxTemp: max,
      isActive: form.isActive,
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit product" : "New product"}
      description={
        isEdit
          ? "Update the storage profile and catalogue details. Codes are immutable."
          : "Register a product and the temperature band it must be stored within."
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Product code"
            htmlFor="product-code"
            required
            error={errors.code}
            hint={isEdit ? "Product codes are immutable after creation." : "Letters, digits and dashes. Uppercased on save."}
          >
            <Input
              id="product-code"
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
              placeholder="e.g. VAC-014"
              autoComplete="off"
              className="font-mono uppercase"
              disabled={isEdit || mutation.isPending}
              aria-invalid={Boolean(errors.code)}
            />
          </Field>

          <Field label="Product name" htmlFor="product-name" required error={errors.name}>
            <Input
              id="product-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Measles vaccine"
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <Field label="Category" htmlFor="product-category" required error={errors.category}>
            <Input
              id="product-category"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="e.g. Vaccine"
              list="product-category-options"
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.category)}
            />
            <datalist id="product-category-options">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>

          <Field label="Manufacturer" htmlFor="product-manufacturer" error={errors.manufacturer}>
            <Input
              id="product-manufacturer"
              value={form.manufacturer}
              onChange={(e) => update("manufacturer", e.target.value)}
              placeholder="e.g. Nordic BioLabs"
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.manufacturer)}
            />
          </Field>

          <Field
            label="Storage type"
            htmlFor="product-storage"
            required
            hint="Drives which storage units are considered compatible."
          >
            <Select
              id="product-storage"
              value={form.storageType}
              onChange={(e) => update("storageType", e.target.value as StorageUnitType)}
              disabled={mutation.isPending}
            >
              {STORAGE_UNIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end pb-1">
            <Switch
              id="product-active"
              label="Product is active"
              checked={form.isActive}
              onChange={(value) => update("isActive", value)}
            />
          </div>

          <Field label="Minimum temperature (°C)" htmlFor="product-min" required error={errors.minTemp}>
            <Input
              id="product-min"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={-90}
              max={40}
              value={form.minTemp}
              onChange={(e) => update("minTemp", e.target.value)}
              placeholder="-25"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.minTemp)}
              className="font-mono"
            />
          </Field>

          <Field label="Maximum temperature (°C)" htmlFor="product-max" required error={errors.maxTemp}>
            <Input
              id="product-max"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={-90}
              max={40}
              value={form.maxTemp}
              onChange={(e) => update("maxTemp", e.target.value)}
              placeholder="-15"
              disabled={mutation.isPending}
              aria-invalid={Boolean(errors.maxTemp)}
              className="font-mono"
            />
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor="product-description"
          error={errors.description}
          hint="Optional handling notes shown to operators on the catalogue."
        >
          <Textarea
            id="product-description"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Handling, packaging and storage notes…"
            disabled={mutation.isPending}
            aria-invalid={Boolean(errors.description)}
          />
        </Field>

        {serverError ? (
          <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
            {serverError}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
