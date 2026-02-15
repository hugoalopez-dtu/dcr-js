import type { ColoredRelations, MarkerNotation } from "../types";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import MenuElement from "../utilComponents/MenuElement";
import Toggle from "../utilComponents/Toggle";

export function ColoredRelationsSetting({
  coloredRelations,
  changeColoredRelations,
}: {
  coloredRelations: ColoredRelations;
  changeColoredRelations: (value: unknown) => void;
}) {
  return (
    <MenuElement>
      <Toggle checked={coloredRelations} onChange={changeColoredRelations} />
      <Label>Coloured Relations</Label>
    </MenuElement>
  );
}

export function MarkerNotationSetting({
  markerNotation,
  changeMarkerNotation,
}: {
  markerNotation: MarkerNotation;
  changeMarkerNotation: (value: unknown) => void;
}) {
  return (
    <MenuElement>
      <DropDown
        options={[
          {
            title: "TAL2023",
            value: "TAL2023",
            tooltip:
              "https://link.springer.com/chapter/10.1007/978-3-031-46846-9_12",
          },
          {
            title: "HM2011",
            value: "HM2011",
            tooltip: "https://arxiv.org/abs/1110.4161",
          },
          {
            title: "DCR Solutions",
            value: "DCR Solutions",
            tooltip: "https://dcrsolutions.net/",
          },
        ]}
        value={markerNotation}
        onChange={changeMarkerNotation}
      />
      <Label>Relation Notation</Label>
    </MenuElement>
  );
}
