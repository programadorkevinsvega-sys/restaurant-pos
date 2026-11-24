import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const dateRange = z.object({ valid_from: z.iso.datetime().nullable().optional(), valid_until: z.iso.datetime().nullable().optional() })
const priceList = z.object({
 name:z.string().trim().min(2).max(120), currency_code:z.string().regex(/^[A-Z]{3}$/),
 scope:z.enum(["corporate","legal_entity","branch"]), ...dateRange.shape,
}).strict().refine(v=>!v.valid_from||!v.valid_until||Date.parse(v.valid_until)>Date.parse(v.valid_from))
const assignment = z.object({price_list_id:uuid,branch_id:uuid,legal_entity_id:uuid}).strict()
const price = z.object({price_list_id:uuid,product_id:uuid,unit_price:z.coerce.number().finite().min(0).max(999999999.9999)}).strict()
const taxRule = z.object({
 legal_entity_id:uuid,code:z.string().trim().min(1).max(40),name:z.string().trim().min(2).max(120),
 tax_type:z.string().trim().min(1).max(40),rate:z.coerce.number().finite().min(0).max(1),...dateRange.shape,
}).strict().refine(v=>!v.valid_from||!v.valid_until||Date.parse(v.valid_until)>Date.parse(v.valid_from))
const productTax = z.object({
 product_id:uuid,legal_entity_id:uuid,price_tax_mode:z.enum(["inclusive","exclusive"]),
 tax_rule_ids:z.array(uuid).max(20).refine(v=>new Set(v).size===v.length),
}).strict()
const promotion = z.object({
 name:z.string().trim().min(2).max(120),scope:z.enum(["corporate","branch"]),
 discount_type:z.enum(["percentage","fixed_amount"]),discount_value:z.coerce.number().finite().positive().max(100000000),
 currency_code:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
 valid_from:z.iso.datetime(),valid_until:z.iso.datetime(),
 branch_ids:z.array(uuid).min(1).max(100).refine(v=>new Set(v).size===v.length),
 product_ids:z.array(uuid).max(500).default([]),category_ids:z.array(uuid).max(200).default([]),
}).strict()
 .refine(v=>Date.parse(v.valid_until)>Date.parse(v.valid_from))
 .refine(v=>v.discount_type!=="percentage"||v.discount_value<=100)
 .refine(v=>v.discount_type!=="fixed_amount"||Boolean(v.currency_code))
 .refine(v=>v.product_ids.length>0||v.category_ids.length>0,{message:"La promoción debe tener al menos un producto o una categoría objetivo.",path:["product_ids"]})
 .refine(v=>new Set(v.product_ids).size===v.product_ids.length,{message:"No repitas productos objetivo.",path:["product_ids"]})
 .refine(v=>new Set(v.category_ids).size===v.category_ids.length,{message:"No repitas categorías objetivo.",path:["category_ids"]})

export function createPricingRoutes(pricing, authenticate, authorize, writesLimiter) {
 const router=Router()
 router.use(authenticate,authorize("admin"))
 router.get("/",asyncHandler(async(req,res)=>res.json(await pricing.list(req.auth))))
 router.post("/price-lists",writesLimiter,validateRequest({body:priceList}),asyncHandler(async(req,res)=>res.status(201).json(await pricing.createPriceList(req.validated.body,req.auth))))
 router.put("/price-list-assignments",writesLimiter,validateRequest({body:assignment}),asyncHandler(async(req,res)=>res.json(await pricing.assignPriceList(req.validated.body,req.auth))))
 router.put("/product-prices",writesLimiter,validateRequest({body:price}),asyncHandler(async(req,res)=>res.json(await pricing.setPrice(req.validated.body,req.auth))))
 router.post("/tax-rules",writesLimiter,validateRequest({body:taxRule}),asyncHandler(async(req,res)=>res.status(201).json(await pricing.createTaxRule(req.validated.body,req.auth))))
 router.put("/product-tax-profiles",writesLimiter,validateRequest({body:productTax}),asyncHandler(async(req,res)=>res.json(await pricing.setProductTax(req.validated.body,req.auth))))
 router.post("/promotions",writesLimiter,validateRequest({body:promotion}),asyncHandler(async(req,res)=>res.status(201).json(await pricing.createPromotion(req.validated.body,req.auth))))
 return router
}
