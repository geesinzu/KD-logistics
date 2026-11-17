import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { TransportInput } from "@contracts/operations";
export function TransportFields({
  value,
  onChange,
  disabled = false,
}: {
  value: TransportInput;
  onChange: (v: TransportInput) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="ops-form-grid" disabled={disabled}>
      <legend>Transport arrangements</legend>
      <div className="ops-span-2">
        <Label htmlFor="transport-company">Logistics company name</Label>
        <Input
          id="transport-company"
          required
          minLength={2}
          maxLength={150}
          value={value.companyName}
          onChange={e => onChange({ ...value, companyName: e.target.value })}
          placeholder="Company carrying these items"
        />
      </div>
      <div>
        <Label htmlFor="transport-contact">Contact person</Label>
        <Input
          id="transport-contact"
          required
          minLength={2}
          maxLength={100}
          value={value.contactName}
          onChange={e => onChange({ ...value, contactName: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="transport-phone">Contact phone</Label>
        <Input
          id="transport-phone"
          type="tel"
          required
          minLength={7}
          maxLength={25}
          value={value.contactPhone}
          onChange={e => onChange({ ...value, contactPhone: e.target.value })}
        />
      </div>
      <div className="ops-span-2">
        <Label htmlFor="transport-mode">
          How will the receiving branch get the items?
        </Label>
        <select
          id="transport-mode"
          className="ops-select"
          value={value.deliveryMode}
          onChange={e =>
            onChange({
              ...value,
              deliveryMode: e.target.value as TransportInput["deliveryMode"],
            })
          }
        >
          <option value="door_to_door">Door-to-door delivery</option>
          <option value="pickup">Branch collects from a pickup location</option>
        </select>
      </div>
      {value.deliveryMode === "pickup" && (
        <div className="ops-span-2">
          <Label htmlFor="transport-pickup">Pickup location</Label>
          <Input
            id="transport-pickup"
            required
            minLength={3}
            maxLength={500}
            value={value.pickupLocation}
            onChange={e =>
              onChange({ ...value, pickupLocation: e.target.value })
            }
            placeholder="Terminal address or collection point"
          />
        </div>
      )}
    </fieldset>
  );
}
