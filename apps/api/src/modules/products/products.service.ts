import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import type { ProductInput } from "@frostguard/shared";

type ListArgs = {
  orgId: string;
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  active?: string;
  sort?: string;
  order: "asc" | "desc";
};

const SORTABLE = new Set(["name", "code", "category", "createdAt"]);

export async function listProducts(args: ListArgs) {
  const where: Prisma.ProductWhereInput = {
    orgId: args.orgId,
    ...(args.active === "true" ? { isActive: true } : args.active === "false" ? { isActive: false } : {}),
    ...(args.category ? { category: args.category } : {}),
    ...(args.search
      ? {
          OR: [
            { name: { contains: args.search } },
            { code: { contains: args.search } },
            { manufacturer: { contains: args.search } },
          ],
        }
      : {}),
  };
  const sortField = args.sort && SORTABLE.has(args.sort) ? args.sort : "createdAt";

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: {
        _count: { select: { batches: true } },
        temperatureProfile: { select: { id: true, name: true, minTemp: true, maxTemp: true } },
      },
      orderBy: { [sortField]: args.order },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export async function getProduct(orgId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, orgId },
    include: {
      temperatureProfile: true,
      batches: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { storageUnit: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  if (!product) throw AppError.notFound("Product not found");
  return product;
}

export async function createProduct(orgId: string, actorId: string, input: ProductInput, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    if (input.temperatureProfileId) {
      const profile = await tx.temperatureProfile.findFirst({
        where: { id: input.temperatureProfileId, orgId },
        select: { id: true },
      });
      if (!profile) throw AppError.badRequest("Temperature profile not found in this organization");
    }

    const product = await tx.product.create({
      data: {
        orgId,
        code: input.code.toUpperCase(),
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        manufacturer: input.manufacturer ?? null,
        storageType: input.storageType,
        minTemp: input.minTemp,
        maxTemp: input.maxTemp,
        isActive: input.isActive,
        temperatureProfileId: input.temperatureProfileId ?? null,
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      metadata: { code: product.code, name: product.name },
      requestId,
    });
    await tx.outboxEvent.create({
      data: { orgId, topic: "product:created", payload: { productId: product.id } },
    });
    return product;
  });
}

export async function updateProduct(
  orgId: string,
  actorId: string,
  id: string,
  input: Partial<ProductInput>,
  requestId?: string
) {
  const existing = await prisma.product.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Product not found");

  return prisma.$transaction(async (tx) => {
    if (input.temperatureProfileId) {
      const profile = await tx.temperatureProfile.findFirst({
        where: { id: input.temperatureProfileId, orgId },
        select: { id: true },
      });
      if (!profile) throw AppError.badRequest("Temperature profile not found in this organization");
    }

    const product = await tx.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
        ...(input.storageType !== undefined ? { storageType: input.storageType } : {}),
        ...(input.minTemp !== undefined ? { minTemp: input.minTemp } : {}),
        ...(input.maxTemp !== undefined ? { maxTemp: input.maxTemp } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.temperatureProfileId !== undefined
          ? { temperatureProfileId: input.temperatureProfileId }
          : {}),
      },
    });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "product.updated",
      entityType: "product",
      entityId: id,
      metadata: { fields: Object.keys(input) },
      requestId,
    });
    return product;
  });
}

export async function deactivateProduct(orgId: string, actorId: string, id: string, requestId?: string) {
  const existing = await prisma.product.findFirst({ where: { id, orgId } });
  if (!existing) throw AppError.notFound("Product not found");
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data: { isActive: false } });
    await writeAudit(tx, {
      orgId,
      actorId,
      action: "product.deactivated",
      entityType: "product",
      entityId: id,
      requestId,
    });
    return product;
  });
}
