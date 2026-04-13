import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

function generateCode(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export const loader = async ({ request }) => {
    try {
        const { admin } = await authenticate.admin(request);

        const collectionRes = await admin.graphql(`#graphql
            query {
                collections(first: 250) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }`);
        const collectionData = await collectionRes.json();

        const productRes = await admin.graphql(`#graphql
            query {
                products(first: 250) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }`);
        const productData = await productRes.json();

        const collections = collectionData.data?.collections?.edges?.map((e) => e.node) || [];
        const products = productData.data?.products?.edges?.map((e) => e.node) || [];

        console.log("Loader — collections:", collections.length, "products:", products.length);
        return { ok: true, collections, products };
    } catch (error) {
        console.error("Loader error:", error);
        return { ok: false, collections: [], products: [], error: String(error) };
    }
};

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const title = formData.get("title");
    const discountType = formData.get("discountType");
    const value = Number(formData.get("value"));
    const numberOfCodes = Number(formData.get("numberOfCodes"));
    const codeLength = Number(formData.get("codeLength"));
    const startDate = formData.get("startDate");
    const applyTo = formData.get("applyTo"); // "all" | "collections" | "products"
    const selectedCollections = formData.getAll("selectedCollections");
    const selectedProducts = formData.getAll("selectedProducts");

    const discountValue =
        discountType === "Percentage"
            ? { percentage: value / 100 }
            : { discountAmount: { amount: value.toFixed(2), appliesOnEachItem: false } };

    let customerGetsItems;
    if (applyTo === "collections" && selectedCollections.length > 0) {
        customerGetsItems = { collections: { add: selectedCollections } };
    } else if (applyTo === "products" && selectedProducts.length > 0) {
        customerGetsItems = { products: { productsToAdd: selectedProducts } };
    } else {
        customerGetsItems = { all: true };
    }

    const codeSet = new Set();
    while (codeSet.size < numberOfCodes) codeSet.add(generateCode(codeLength));
    const [firstCode, ...restCodes] = [...codeSet];

    try {
        const createRes = await admin.graphql(
            `#graphql
            mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    basicCodeDiscount: {
                        title,
                        code: firstCode,
                        startsAt: new Date(startDate).toISOString(),
                        customerGets: {
                            value: discountValue,
                            items: customerGetsItems,
                        },
                        customerSelection: { all: true },
                    },
                },
            }
        );

        const createJson = await createRes.json();
        const createErrors = createJson.data?.discountCodeBasicCreate?.userErrors;
        if (createErrors?.length > 0) {
            console.error("Discount creation errors:", createErrors);
            return { success: false, message: createErrors[0].message };
        }

        const discountId = createJson.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
        if (!discountId) {
            console.error("Failed to create discount:", createJson);
            return { success: false, message: "Failed to create discount code." };
        }

        if (restCodes.length > 0) {
            const bulkRes = await admin.graphql(
                `#graphql
                mutation discountRedeemCodeBulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
                    discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
                        bulkCreation { id }
                        userErrors { code field message }
                    }
                }`,
                {
                    variables: {
                        discountId,
                        codes: restCodes.map((code) => ({ code })),
                    },
                }
            );

            const bulkJson = await bulkRes.json();
            const bulkErrors = bulkJson.data?.discountRedeemCodeBulkAdd?.userErrors;
            if (bulkErrors?.length > 0) {
                console.error("Bulk code add errors:", bulkErrors);
                return { success: false, message: bulkErrors[0].message };
            }
        }

        return {
            success: true,
            message: `${numberOfCodes} discount code${numberOfCodes !== 1 ? "s" : ""} created successfully.`,
            codes: [firstCode, ...restCodes],
        };
    } catch (error) {
        console.error("Action error:", error);
        return { success: false, message: "An unexpected error occurred." };
    }
};

export default function CreateDiscountUI() {
    const loaderData = useLoaderData();
    const collections = loaderData?.collections ?? [];
    const products = loaderData?.products ?? [];
    const loaderError = loaderData?.error;
    const fetcher = useFetcher();

    const [title, setTitle] = useState("Bulk Discount Offer");
    const [discountType, setDiscountType] = useState("Percentage");
    const [value, setValue] = useState(10);
    const [numberOfCodes, setNumberOfCodes] = useState(5);
    const [codeLength, setCodeLength] = useState(8);
    const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
    const [applyTo, setApplyTo] = useState("all");
    const [selectedCollections, setSelectedCollections] = useState([]);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [codes, setCodes] = useState([]);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");

    useEffect(() => {
        if (fetcher.data) {
            if (fetcher.data.success) {
                setToast(fetcher.data.message);
                setCodes(fetcher.data.codes || []);
                setError("");
            } else {
                setError(fetcher.data.message || "An error occurred while creating discount codes.");
                setToast("");
            }
        }
    }, [fetcher.data]);

    function toggleItem(id, list, setList) {
        setList(list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);
    }

    function submit() {
        setError("");
        setToast("");
        setCodes([]);
        const formData = new FormData();
        formData.append("title", title);
        formData.append("discountType", discountType);
        formData.append("value", value.toString());
        formData.append("numberOfCodes", numberOfCodes.toString());
        formData.append("codeLength", codeLength.toString());
        formData.append("startDate", startDate);
        formData.append("applyTo", applyTo);
        if (applyTo === "collections") {
            selectedCollections.forEach((id) => formData.append("selectedCollections", id));
        } else if (applyTo === "products") {
            selectedProducts.forEach((id) => formData.append("selectedProducts", id));
        }
        fetcher.submit(formData, { method: "post" });
    }

    return (
        <s-page heading="Bulk Discount Code Generator" padding="base">
            <s-section heading="Create Discount Codes" padding="base">
                <s-card padding="base">
                    <s-stack gap="base">
                        {loaderError && (
                            <s-banner variant="critical">Failed to load store data: {loaderError}</s-banner>
                        )}
                        <s-text-field
                            label="Title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        <s-select
                            label="Discount Type"
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value)}
                        >
                            <s-option value="Percentage">Percentage</s-option>
                            <s-option value="Fixed Amount">Fixed Amount</s-option>
                        </s-select>
                        <s-text-field
                            label={discountType === "Percentage" ? "Discount Percentage (0–100)" : "Discount Amount ($)"}
                            type="number"
                            value={value}
                            onChange={(e) => setValue(Number(e.target.value))}
                        />
                        <s-text-field
                            label="Number of Codes"
                            type="number"
                            value={numberOfCodes}
                            onChange={(e) => setNumberOfCodes(Number(e.target.value))}
                        />
                        <s-text-field
                            label="Code Length"
                            type="number"
                            value={codeLength}
                            onChange={(e) => setCodeLength(Number(e.target.value))}
                        />
                        <s-text-field
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />

                        <s-select
                            label="Apply Discount To"
                            value={applyTo}
                            onChange={(e) => {
                                setApplyTo(e.target.value);
                                setSelectedCollections([]);
                                setSelectedProducts([]);
                            }}
                        >
                            <s-option value="all">All Products</s-option>
                            <s-option value="collections">Specific Collections</s-option>
                            <s-option value="products">Specific Products</s-option>
                        </s-select>

                        {applyTo === "collections" && (
                            <s-box padding="base" border="base" border-radius="base">
                                <s-stack gap="tight">
                                    <s-text emphasis="bold">
                                        Select Collections ({selectedCollections.length} selected)
                                    </s-text>
                                    {collections.length === 0 ? (
                                        <s-text>No collections found in your store.</s-text>
                                    ) : (
                                        collections.map((col) => (
                                            <s-checkbox
                                                key={col.id}
                                                label={col.title}
                                                checked={selectedCollections.includes(col.id)}
                                                onChange={() => toggleItem(col.id, selectedCollections, setSelectedCollections)}
                                            />
                                        ))
                                    )}
                                </s-stack>
                            </s-box>
                        )}

                        {applyTo === "products" && (
                            <s-box padding="base" border="base" border-radius="base">
                                <s-stack gap="tight">
                                    <s-text emphasis="bold">
                                        Select Products ({selectedProducts.length} selected)
                                    </s-text>
                                    {products.length === 0 ? (
                                        <s-text>No products found in your store.</s-text>
                                    ) : (
                                        products.map((prod) => (
                                            <s-checkbox
                                                key={prod.id}
                                                label={prod.title}
                                                checked={selectedProducts.includes(prod.id)}
                                                onChange={() => toggleItem(prod.id, selectedProducts, setSelectedProducts)}
                                            />
                                        ))
                                    )}
                                </s-stack>
                            </s-box>
                        )}

                        <s-button
                            variant="primary"
                            disabled={fetcher.state === "submitting"}
                            onClick={submit}
                        >
                            {fetcher.state === "submitting" ? "Creating..." : "Generate Discount Codes"}
                        </s-button>
                        {fetcher.state === "submitting" && <s-spinner />}
                        {error && <s-banner variant="critical">{error}</s-banner>}
                        {toast && <s-banner variant="success">{toast}</s-banner>}
                    </s-stack>
                </s-card>
            </s-section>

            {codes.length > 0 && (
                <s-section heading="Generated Discount Codes" padding="base">
                    <s-card padding="base">
                        <s-stack gap="base">
                            <s-unordered-list variant="bullet">
                                {codes.map((code, index) => (
                                    <s-list-item key={index}>{code}</s-list-item>
                                ))}
                            </s-unordered-list>
                        </s-stack>
                    </s-card>
                </s-section>
            )}
        </s-page>
    );
}
