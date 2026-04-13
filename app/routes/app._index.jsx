import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const navigate = useNavigate();

  return (
    <s-page heading="Bulk Discount" padding="base">
      <s-section padding="base">
        <s-card padding="base">
          <s-stack gap="loose">
            <s-text variant="headingLg">Welcome to Bulk Discount</s-text>
            <s-text>
              Generate hundreds of unique discount codes in seconds. Set a
              percentage or fixed amount, choose how many codes you need, and
              create them all at once — no manual work required.
            </s-text>
            <s-stack direction="horizontal" gap="base">
              <s-button
                variant="primary"
                onClick={() => navigate("/app/creatediscount")}
              >
                Create Discount Codes
              </s-button>
            </s-stack>
          </s-stack>
        </s-card>
      </s-section>

      <s-section heading="Features" padding="base">
        <s-card padding="base">
          <s-stack gap="base">
            <s-stack direction="horizontal" gap="base">
              <s-stack gap="tight">
                <s-text variant="headingMd">Bulk Code Generation</s-text>
                <s-text>
                  Create up to hundreds of unique discount codes in a single
                  action, saving you hours of manual work.
                </s-text>
              </s-stack>
            </s-stack>
            <s-divider />
            <s-stack direction="horizontal" gap="base">
              <s-stack gap="tight">
                <s-text variant="headingMd">Flexible Discount Types</s-text>
                <s-text>
                  Choose between percentage discounts or fixed amount discounts
                  to match your promotion strategy.
                </s-text>
              </s-stack>
            </s-stack>
            <s-divider />
            <s-stack direction="horizontal" gap="base">
              <s-stack gap="tight">
                <s-text variant="headingMd">Custom Code Length</s-text>
                <s-text>
                  Control the length of generated codes to fit your brand
                  style or security requirements.
                </s-text>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-card>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
